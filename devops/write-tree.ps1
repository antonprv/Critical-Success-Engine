# Generates a tree-like directory structure.
# Excluded directories are skipped completely.
# The output file itself is excluded to prevent it from appearing in the tree.

param (
    [string]$RootPath = '.',
    [string]$OutputPath = 'file-tree.txt'
)

$ExcludedDirectories = @(
    '.git',
    '.vs',
    'node_modules',
    'bin',
    'obj',
    'dist'
)

$ExcludedFiles = @(
    [System.IO.Path]::GetFullPath($OutputPath)
)

function Write-Tree {
    param (
        [Parameter(Mandatory)]
        [string]$Path,

        [string]$Prefix = ''
    )

    try {
        $Items = @(
            Get-ChildItem -LiteralPath $Path -Force -ErrorAction Stop |
                Where-Object {
                    if ($_.PSIsContainer) {
                        return $_.Name -notin $ExcludedDirectories
                    }

                    $FullPath = [System.IO.Path]::GetFullPath($_.FullName)
                    return $FullPath -notin $ExcludedFiles
                } |
                Sort-Object -Property @(
                    @{ Expression = { -not $_.PSIsContainer } }
                    @{ Expression = { $_.Name } }
                )
        )
    }
    catch {
        "$Prefix└── [Unable to access: $($_.Exception.Message)]"
        return
    }

    for ($Index = 0; $Index -lt $Items.Count; $Index++) {
        $Item = $Items[$Index]
        $IsLast = $Index -eq $Items.Count - 1

        if ($IsLast) {
            $Branch = '└── '
            $ChildPrefix = "$Prefix    "
        }
        else {
            $Branch = '├── '
            $ChildPrefix = "$Prefix│   "
        }

        "$Prefix$Branch$($Item.Name)"

        if ($Item.PSIsContainer) {
            Write-Tree `
                -Path $Item.FullName `
                -Prefix $ChildPrefix
        }
    }
}

$RootPath = [System.IO.Path]::GetFullPath($RootPath)
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)

# Make sure the output file is excluded even when OutputPath is relative.
$ExcludedFiles = @($OutputPath)

$Tree = @(
    Split-Path -Leaf $RootPath
    Write-Tree -Path $RootPath
)

$Tree | Out-File `
    -LiteralPath $OutputPath `
    -Encoding utf8