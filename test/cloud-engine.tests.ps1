$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\connector\CloudEngine.ps1')
$temp=Join-Path ([IO.Path]::GetTempPath()) ('vlt-engine-test-'+[guid]::NewGuid().ToString('N'))
$script:CloudProfiles=Join-Path $temp 'profiles'
$script:CloudBackups=Join-Path $temp 'backups'
function Encode-Fixture([string]$value) {
    $json=@{actionMappings=@(@{name='Jump';key=$value});floatSettings=@(@{settingEnum='MouseSensitivity';value=0.16});unknownSetting=@{preserve=$value}} | ConvertTo-Json -Depth 10 -Compress
    $stream=[IO.MemoryStream]::new()
    $deflate=[IO.Compression.DeflateStream]::new($stream,[IO.Compression.CompressionMode]::Compress,$true)
    $bytes=[Text.Encoding]::UTF8.GetBytes($json); $deflate.Write($bytes,0,$bytes.Length); $deflate.Dispose()
    $data=[Convert]::ToBase64String($stream.ToArray()); $stream.Dispose(); return $data
}
$script:RemoteData=Encode-Fixture 'OLD'
$original=$script:RemoteData; $desired=Encode-Fixture 'NEW'
$script:FakeId='00000000-0000-0000-0000-000000000001'
$script:Writes=0; $script:Game=$false
function Get-CloudSession {return [pscustomobject]@{Id=$script:FakeId;Label='Test';Headers=@{Authorization='FAKE-SECRET'}}}
function Get-Process {if($script:Game){return @{Name='VALORANT'}}}
function Invoke-RestMethod {
    param($Method,$Uri,$Headers,$ContentType,$Body,$TimeoutSec)
    if($Method -eq 'Put'){$script:Writes++;$script:RemoteData=($Body | ConvertFrom-Json).data;return @{success=$true}}
    return @{data=$script:RemoteData}
}
function Expect-Blocked([scriptblock]$action){$before=$script:Writes;try{& $action;throw 'GUARD_FAILED'}catch{if($_.Exception.Message -eq 'GUARD_FAILED'){throw}};if($before -ne $script:Writes){throw 'Blocked action wrote to Riot'}}
try {
    $profile=Save-CloudDocument $script:CloudProfiles 'Version test' '00000000-0000-0000-0000-000000000002' $desired
    $backup=Apply-CloudProfile $profile $script:FakeId
    if($script:RemoteData -cne $desired){throw 'Apply/readback failed'}
    if((Get-Content -LiteralPath $backup -Raw | ConvertFrom-Json).Data -cne $original){throw 'Backup mismatch'}
    [void](Apply-CloudProfile $backup $script:FakeId -Restore)
    if($script:RemoteData -cne $original){throw 'Restore mismatch'}
    $export=Export-CloudProfile 'Saved profile' $script:FakeId
    if((Get-Content -LiteralPath $export -Raw) -match 'Authorization|FAKE-SECRET|accessToken'){throw 'Credentials persisted'}
    Expect-Blocked {Apply-CloudProfile $profile '00000000-0000-0000-0000-000000000003'}
    Expect-Blocked {Apply-CloudProfile $profile $script:FakeId -Restore}
    $script:Game=$true
    Expect-Blocked {Apply-CloudProfile $profile $script:FakeId}
    'PASS: encoded profiles, unknown settings preserved, backup, restore, account guards, game guard, credentials excluded. Mocked network only.'
} finally {
    $resolved=[IO.Path]::GetFullPath($temp)
    $allowed=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if($resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf) -like 'vlt-engine-test-*'){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
