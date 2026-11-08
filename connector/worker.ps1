$ErrorActionPreference='Stop'
try {
    . (Join-Path $PSScriptRoot 'CloudEngine.ps1')
    $request=[Console]::In.ReadToEnd() | ConvertFrom-Json
    function List-Documents($folder) {
        $entries=@()
        foreach($file in @(Get-ChildItem -LiteralPath $folder -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)) {
            try {
                $doc=Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
                if($doc.Type -ne 'Ares.PlayerSettings' -or !$doc.Data){continue}
                $entries+=[pscustomobject]@{id=$file.BaseName; name=$doc.Name; source=$doc.Source; created=$doc.Created}
            } catch {continue}
        }
        return ,$entries
    }
    switch($request.action) {
        'status' {
            $session=Get-CloudSession
            $result=@{account=@{id=$session.Id; name=$session.Label}; gameRunning=[bool](Get-Process -Name 'VALORANT*' -ErrorAction SilentlyContinue)}
        }
        'list' {$result=@{profiles=(List-Documents $script:CloudProfiles); backups=(List-Documents $script:CloudBackups)}}
        'save' {
            $path=Export-CloudProfile ([string]$request.name) ([string]$request.account)
            $result=@{id=[IO.Path]::GetFileNameWithoutExtension($path)}
        }
        {$_ -in 'apply','restore'} {
            if($request.id -notmatch '^[A-Za-z0-9-]{1,100}$'){throw 'Identifiant de profil invalide.'}
            $folder=if($request.action -eq 'restore'){$script:CloudBackups}else{$script:CloudProfiles}
            $path=Join-Path $folder ($request.id+'.json')
            $backup=Apply-CloudProfile $path ([string]$request.account) -Restore:($request.action -eq 'restore')
            $result=@{verified=$true; backup=[IO.Path]::GetFileNameWithoutExtension($backup)}
        }
        default {throw 'Action inconnue.'}
    }
    @{ok=$true; result=$result} | ConvertTo-Json -Depth 15 -Compress | Write-Output
} catch {
    @{ok=$false; error=$_.Exception.Message} | ConvertTo-Json -Compress | Write-Output
    exit 1
}
