$script:DataRoot=Join-Path $env:LOCALAPPDATA 'VLTProfiles'
$ErrorActionPreference='Stop'
$script:CloudProfiles=Join-Path $script:DataRoot 'Profils-Cloud'
$script:CloudBackups=Join-Path $script:DataRoot 'Sauvegardes-Cloud'
$script:PreferenceUrl='https://player-preferences-usw2.pp.sgp.pvp.net/playerPref/v3/'
function Get-CloudSession {
    $lockPath=Join-Path $env:LOCALAPPDATA 'Riot Games\Riot Client\Config\lockfile'
    if (!(Test-Path -LiteralPath $lockPath)) { throw 'Open Riot Client and sign in to the account you want to use.' }
    $stream=[IO.File]::Open($lockPath,'Open','Read','ReadWrite')
    $reader=[IO.StreamReader]::new($stream)
    try { $parts=$reader.ReadToEnd().Trim().Split(':') } finally { $reader.Dispose(); $stream.Dispose() }
    if ($parts.Count -ne 5 -or $parts[4] -ne 'https' -or $parts[2] -notmatch '^\d+$') { throw 'Invalid local Riot session.' }
    $authorization='Basic '+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('riot:'+$parts[3]))
    try { $tokens=Invoke-RestMethod -Uri ('https://127.0.0.1:'+$parts[2]+'/entitlements/v1/token') -Headers @{Authorization=$authorization} -SkipCertificateCheck -NoProxy -TimeoutSec 12 } catch { throw 'Riot session unavailable. Check that Riot Client is signed in.' }
    if (!$tokens.accessToken -or !$tokens.token) { throw 'No account signed in to Riot Client.' }
    $payload=$tokens.accessToken.Split('.')[1].Replace('-','+').Replace('_','/')
    $payload=$payload.PadRight($payload.Length+(4-$payload.Length%4)%4,'=')
    $claims=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
    $id=[string]$claims.sub
    if ($id -notmatch '^[a-fA-F0-9-]{36}$') { throw 'Invalid Riot account ID.' }
    $label='Account '+$id.Substring(0,8)
    $aliasPath=Join-Path $script:DataRoot 'comptes.json'
    if (Test-Path -LiteralPath $aliasPath) {
        $aliases=Get-Content -LiteralPath $aliasPath -Raw | ConvertFrom-Json
        $alias=$aliases.PSObject.Properties[$id+'-eu']
        if ($alias) { $label=[string]$alias.Value }
    }
    return [pscustomobject]@{Id=$id; Label=$label; Headers=@{Authorization=('Bearer '+$tokens.accessToken); 'X-Riot-Entitlements-JWT'=$tokens.token}}
}
function Read-CloudSettings($Session) {
    try { $response=Invoke-RestMethod -Uri ($script:PreferenceUrl+'getPreference/Ares.PlayerSettings') -Headers $Session.Headers -TimeoutSec 25 } catch { throw 'Could not read settings from Riot. No transfer performed.' }
    if ($response.error -or $response.errorCode -or $response.data -isnot [string] -or !$response.data) { throw 'Riot did not return a usable profile.' }
    [void](Decode-CloudSettings $response.data)
    return $response.data
}
function Decode-CloudSettings([string]$Data) {
    $stream=[IO.MemoryStream]::new([Convert]::FromBase64String($Data))
    $inflate=[IO.Compression.DeflateStream]::new($stream,[IO.Compression.CompressionMode]::Decompress)
    $reader=[IO.StreamReader]::new($inflate)
    try { $settings=$reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose(); $inflate.Dispose(); $stream.Dispose() }
    if (!$settings.actionMappings -or !$settings.PSObject.Properties['floatSettings']) { throw 'The settings profile is incomplete or invalid.' }
    return $settings
}
function Save-CloudDocument([string]$Folder,[string]$Name,[string]$Account,[string]$Data) {
    [void](Decode-CloudSettings $Data)
    New-Item -ItemType Directory -Path $Folder -Force | Out-Null
    $path=Join-Path $Folder ((Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N')+'.json')
    $document=[pscustomobject]@{Name=$Name; Source=$Account; Created=(Get-Date).ToString('o'); Type='Ares.PlayerSettings'; Data=$Data}
    $document | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $path -Encoding UTF8
    return $path
}
function Export-CloudProfile([string]$Name,[string]$ExpectedAccount) {
    $Name=$Name.Trim()
    if (!$Name -or $Name.Length -gt 60) { throw 'Choose a name between 1 and 60 characters.' }
    $session=Get-CloudSession
    if ($session.Id -ne $ExpectedAccount) { throw 'The signed-in account changed. Detect it again before retrying.' }
    $data=Read-CloudSettings $session
    return Save-CloudDocument $script:CloudProfiles $Name $session.Id $data
}
function Apply-CloudProfile([string]$Path,[string]$ExpectedAccount,[switch]$Restore) {
    if (Get-Process -Name 'VALORANT*' -ErrorAction SilentlyContinue) { throw 'Close VALORANT. Keep Riot Client signed in to the destination account.' }
    $profile=Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    if ($profile.Type -ne 'Ares.PlayerSettings' -or $profile.Source -notmatch '^[a-fA-F0-9-]{36}$') { throw 'Invalid profile.' }
    [void](Decode-CloudSettings $profile.Data)
    $session=Get-CloudSession
    if ($session.Id -ne $ExpectedAccount) { throw 'The signed-in account changed. No transfer performed.' }
    if ($Restore -and $profile.Source -ne $session.Id) { throw 'This backup belongs to another account. Sign in to the matching account.' }
    $previous=Read-CloudSettings $session
    $backup=Save-CloudDocument $script:CloudBackups ($session.Label+' / before transfer') $session.Id $previous
    $fresh=Get-CloudSession
    if ($fresh.Id -ne $session.Id) { throw 'The account changed before transfer. No transfer performed.' }
    if (Get-Process -Name 'VALORANT*' -ErrorAction SilentlyContinue) { throw 'VALORANT started. Close it before transferring settings.' }
    try {
        $body=@{type='Ares.PlayerSettings'; data=$profile.Data} | ConvertTo-Json -Compress
        $result=Invoke-RestMethod -Method Put -Uri ($script:PreferenceUrl+'savePreference') -Headers $fresh.Headers -ContentType 'application/json' -Body $body -TimeoutSec 25
        if ($result.errorCode -or $result.error -or $result.success -eq $false) { throw 'Riot rejected the request.' }
        $readback=Read-CloudSettings $fresh
    } catch { throw "Transfer not confirmed. Check the account before retrying. Backup: $backup" }
    if ($readback -cne $profile.Data) { throw "Settings read back from Riot differ from the profile. Check the transfer. Backup: $backup" }
    return $backup
}

