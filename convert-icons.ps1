Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\sachin.s\.gemini\antigravity\brain\40450013-a266-44e0-b034-7cdac3accf24\rebirth_icon_1783782580950.png"
$destDir = "C:\Users\sachin.s\.gemini\antigravity\scratch\breathing-widget"

# Convert icon-192
$img = [System.Drawing.Image]::FromFile($srcPath)
$bmp192 = New-Object System.Drawing.Bitmap($img, 192, 192)
$img.Dispose()
$dest192 = Join-Path $destDir "icon-192.png"
if (Test-Path $dest192) { Remove-Item $dest192 -Force }
$bmp192.Save($dest192, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp192.Dispose()
Write-Host "icon-192.png created"

# Convert icon-512
$img2 = [System.Drawing.Image]::FromFile($srcPath)
$bmp512 = New-Object System.Drawing.Bitmap($img2, 512, 512)
$img2.Dispose()
$dest512 = Join-Path $destDir "icon-512.png"
if (Test-Path $dest512) { Remove-Item $dest512 -Force }
$bmp512.Save($dest512, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp512.Dispose()
Write-Host "icon-512.png created"

Write-Host "Done!"
