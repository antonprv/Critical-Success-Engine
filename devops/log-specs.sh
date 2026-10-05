#!/usr/bin/env bash

echo "=== CPU ==="
lscpu | grep -E \
    '^(Model name|CPU\(s\)|Core\(s\) per socket|Thread\(s\) per core|CPU max MHz):' |
    sed 's/^[^:]*:[[:space:]]*/ /'

echo
echo "=== RAM ==="
free -h | awk '/^Mem:/ {
    printf "TotalRAM: %s\n", $2
}'

if command -v dmidecode >/dev/null 2>&1; then
    sudo dmidecode --type memory 2>/dev/null |
        awk -F': ' '
            /Size:/ && $2 !~ /No Module Installed/ {
                size = $2
                speed = ""
            }
            /Speed:/ && $2 != "Unknown" {
                speed = $2
                printf "%s @ %s\n", size, speed
            }
        '
fi

echo
echo "=== GPU ==="

if command -v lspci >/dev/null 2>&1; then
    lspci -nn |
        grep -Ei 'VGA compatible controller|3D controller|Display controller' |
        sed 's/^[^:]*: //'

    if command -v nvidia-smi >/dev/null 2>&1; then
        echo
        echo "--- NVIDIA VRAM ---"

        nvidia-smi \
            --query-gpu=name,memory.total \
            --format=csv,noheader
    fi
else
    echo "lspci is not installed."
fi

echo
echo "=== Storage ==="

if command -v lsblk >/dev/null 2>&1; then
    lsblk -d -o NAME,MODEL,SIZE,TYPE,TRAN |
        awk 'NR == 1 || $4 == "disk"'
else
    echo "lsblk is not installed."
fi
