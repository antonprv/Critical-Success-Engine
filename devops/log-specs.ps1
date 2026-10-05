"=== CPU ==="
Get-WmiObject Win32_Processor |
    Select-Object Name, NumberOfCores, NumberOfLogicalProcessors,
        @{N="MaxClockSpeed_MHz";E={$_.MaxClockSpeed}} |
    Format-List

"`n=== RAM ==="
$ram = Get-WmiObject Win32_ComputerSystem
$sticks = Get-WmiObject Win32_PhysicalMemory

[PSCustomObject]@{
    TotalRAM_GB = [math]::Round($ram.TotalPhysicalMemory / 1GB, 2)
    Sticks = $sticks.Count
    StickDetails = ($sticks | ForEach-Object {
        "$([math]::Round($_.Capacity / 1GB, 1))GB @ $($_.Speed)MHz"
    }) -join ", "
} | Format-List

"`n=== GPU ==="
$gpus = Get-WmiObject Win32_VideoController

if ($gpus) {
    $gpus |
        Select-Object Name,
            @{N="VRAM_GB";E={
                if ($_.AdapterRAM) {
                    [math]::Round($_.AdapterRAM / 1GB, 1)
                }
                else {
                    "Shared"
                }
            }},
            DriverVersion,
            VideoProcessor |
        Format-List
}
else {
    "No GPU detected."
}

"`n=== Storage ==="
Get-WmiObject Win32_DiskDrive |
    Select-Object Model, InterfaceType,
        @{N="Size_GB";E={[math]::Round($_.Size / 1GB, 2)}} |
    Format-Table -AutoSize