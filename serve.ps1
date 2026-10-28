$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8478/')
$listener.Start()
Write-Host 'Breathing Widget server running at http://localhost:8478/'
Write-Host 'Press Ctrl+C to stop.'

$root = $PSScriptRoot

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $localPath = $request.Url.LocalPath
    if ($localPath -eq '/') {
        $localPath = '/index.html'
    }

    $filePath = Join-Path $root ($localPath.TrimStart('/'))

    if (Test-Path $filePath) {
        $content = [System.IO.File]::ReadAllBytes($filePath)
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()

        $mime = switch ($ext) {
            '.html' { 'text/html; charset=utf-8' }
            '.css'  { 'text/css; charset=utf-8' }
            '.js'   { 'application/javascript; charset=utf-8' }
            '.json' { 'application/json; charset=utf-8' }
            '.svg'  { 'image/svg+xml' }
            '.png'  { 'image/png' }
            default { 'application/octet-stream' }
        }

        $response.ContentType = $mime
        $response.ContentLength64 = $content.Length
        $response.OutputStream.Write($content, 0, $content.Length)
        Write-Host "200 $($request.HttpMethod) $($request.Url.LocalPath)"
    }
    else {
        $response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
        $response.OutputStream.Write($msg, 0, $msg.Length)
        Write-Host "404 $($request.HttpMethod) $($request.Url.LocalPath)"
    }

    $response.Close()
}
