# Servidor local minimo para la maqueta (no requiere instalar nada)
# Sirve esta carpeta en http://localhost:8000 para que OpenStreetMap entregue el mapa
$port = 8000
$root = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try { $listener.Start() } catch {
  Write-Host "No se pudo abrir el puerto $port. Cierra otras ventanas de la maqueta e intenta de nuevo."
  exit 1
}
Write-Host "Maqueta disponible en http://localhost:$port/index.html"
Write-Host "Para detenerla, cierra esta ventana."
Start-Process "http://localhost:$port/index.html"
$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8';
  '.css' = 'text/css; charset=utf-8'; '.png' = 'image/png'; '.jpg' = 'image/jpeg';
  '.svg' = 'image/svg+xml'; '.json' = 'application/json'; '.txt' = 'text/plain; charset=utf-8'
}
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq '') { $rel = 'index.html' }
    $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if ($full.StartsWith($root) -and (Test-Path $full -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($full)
      $ext = [IO.Path]::GetExtension($full).ToLower()
      if ($types.ContainsKey($ext)) { $ctx.Response.ContentType = $types[$ext] } else { $ctx.Response.ContentType = 'application/octet-stream' }
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
  } catch {
    $ctx.Response.StatusCode = 500
  } finally {
    $ctx.Response.Close()
  }
}
