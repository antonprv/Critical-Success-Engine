function Write-Tree {
    param (
        [string]$Path,
        [string]$Prefix = ''
    )

    $ExcludedDirectories = @(
        'node_modules',
        '.git'
    )

    $Items = Get-ChildItem -LiteralPath $Path -Force |
        Sort-Object @{ Expression = { -not $_.PSIsContainer } }, Name

    foreach ($Item in $Items) {
        "$Prefix├── $($Item.Name)"

        if (
            $Item.PSIsContainer -and
            $Item.Name -notin $ExcludedDirectories
        ) {
            Write-Tree $Item.FullName "$Prefix│   "
        }
    }
}

Write-Tree . | Out-File file-tree.txt -Encoding utf8