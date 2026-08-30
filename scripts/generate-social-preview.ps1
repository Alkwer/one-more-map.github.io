# Original project diagram. Run with PowerShell on Windows to regenerate the PNG.
Add-Type -AssemblyName System.Drawing
$destination = Join-Path $PSScriptRoot '../public/social-preview.png'
$bitmap = [Drawing.Bitmap]::new(1200, 630)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$background = [Drawing.ColorTranslator]::FromHtml('#0a0908')
$gold = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#e5c27f'))
$foreground = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#ede6d7'))
$muted = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#b8b1a2'))
$grid = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#75613d'), 3)
$route = [Drawing.Pen]::new($gold, 12)
$route.StartCap = [Drawing.Drawing2D.LineCap]::Round
$route.EndCap = [Drawing.Drawing2D.LineCap]::Round
$title = [Drawing.Font]::new('Segoe UI', 50, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
$subtitle = [Drawing.Font]::new('Segoe UI', 25, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
$label = [Drawing.Font]::new('Segoe UI', 21, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
try {
  $graphics.Clear($background)
  $graphics.FillRectangle($gold, 68, 88, 56, 4)
  $graphics.DrawString('PATH OF EXILE 3.29', $label, $gold, 68, 124)
  $graphics.DrawString('Allflame', $title, $foreground, 64, 190)
  $graphics.DrawString('Voyage Solver', $title, $foreground, 64, 250)
  $graphics.DrawString('Import charts. Compare rewards.', $subtitle, $muted, 68, 356)
  $graphics.DrawString('Plan your next voyage.', $subtitle, $muted, 68, 397)
  $graphics.DrawString('COMMUNITY VOYAGE PLANNER', $label, $gold, 68, 516)
  for ($index = 0; $index -le 3; $index++) {
    $offset = $index * 112
    $graphics.DrawLine($grid, 768 + $offset, 144, 768 + $offset, 480)
    $graphics.DrawLine($grid, 768, 144 + $offset, 1104, 144 + $offset)
  }
  $points = [Drawing.Point[]]@(
    [Drawing.Point]::new(824, 424), [Drawing.Point]::new(824, 312),
    [Drawing.Point]::new(936, 312), [Drawing.Point]::new(936, 200),
    [Drawing.Point]::new(1048, 200)
  )
  $graphics.DrawLines($route, $points)
  $graphics.FillEllipse($gold, 811, 411, 26, 26)
  $graphics.FillEllipse($gold, 1035, 187, 26, 26)
  $bitmap.Save($destination, [Drawing.Imaging.ImageFormat]::Png)
} finally {
  foreach ($resource in @($label, $subtitle, $title, $route, $grid, $muted, $foreground, $gold, $graphics, $bitmap)) {
    $resource.Dispose()
  }
}
