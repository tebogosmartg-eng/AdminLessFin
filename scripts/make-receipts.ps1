# Create clear and blurry receipt JPEGs for OCR checkpoint
Add-Type -AssemblyName System.Drawing

function New-Receipt([string]$path, [bool]$blurry) {
  $bmp = New-Object System.Drawing.Bitmap 640, 480
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  if ($blurry) {
    $g.Clear([System.Drawing.Color]::FromArgb(200,200,200))
    $font = New-Object System.Drawing.Font "Arial", 12
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(180,180,180))
    $g.DrawString("???? store", $font, $brush, 40, 80)
    $g.DrawString("R ?.??", $font, $brush, 40, 140)
    # noise
    $rand = New-Object System.Random
    for ($i=0; $i -lt 8000; $i++) {
      $x = $rand.Next(0,639); $y = $rand.Next(0,479)
      $bmp.SetPixel($x,$y, [System.Drawing.Color]::FromArgb($rand.Next(255),$rand.Next(255),$rand.Next(255)))
    }
  } else {
    $g.Clear([System.Drawing.Color]::White)
    $font = New-Object System.Drawing.Font "Arial", 22
    $brush = [System.Drawing.Brushes]::Black
    $g.DrawString("ENGEN CONVENIENCE", $font, $brush, 60, 60)
    $g.DrawString("Date: 2026-07-20", $font, $brush, 60, 120)
    $g.DrawString("Fuel 95 ULP", $font, $brush, 60, 180)
    $g.DrawString("TOTAL R 412.50", $font, $brush, 60, 240)
    $g.DrawString("Thank you", $font, $brush, 60, 300)
  }
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $bmp.Dispose()
  Write-Host "wrote $path"
}

New-Receipt "scripts/tmp-receipt-clear.jpg" $false
New-Receipt "scripts/tmp-receipt-blurry.jpg" $true
