param([string]$In, [string]$Out, [int]$H = 130)
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile($In)
$bmp = New-Object System.Drawing.Bitmap($src.Width, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $src.Width, $H)), (New-Object System.Drawing.Rectangle(0, 0, $src.Width, $H)), [System.Drawing.GraphicsUnit]::Pixel)
$bmp.Save($Out)
$g.Dispose(); $bmp.Dispose(); $src.Dispose()
Write-Output OK
