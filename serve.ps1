# Simple static file server for the Wii-Portfolio project.
# Usage:  powershell -ExecutionPolicy Bypass -File serve.ps1
# Then open:  http://localhost:8000/
param([int]$Port = 8000)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = "http://localhost:$Port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving '$root'"
Write-Host "Open: $prefix   (Ctrl+C to stop)"

$mime = @{
    ".html"="text/html";  ".htm"="text/html";   ".css"="text/css";
    ".js"="application/javascript"; ".json"="application/json";
    ".png"="image/png";   ".jpg"="image/jpeg";  ".jpeg"="image/jpeg";
    ".gif"="image/gif";   ".svg"="image/svg+xml"; ".webp"="image/webp";
    ".ico"="image/x-icon"; ".mp3"="audio/mpeg";  ".mp4"="video/mp4";
    ".webm"="video/webm"; ".ttf"="font/ttf";     ".otf"="font/otf";
    ".xcf"="application/octet-stream"; ".txt"="text/plain";
}

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
    } catch { break }

    $relPath = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($relPath)) { $relPath = "index.html" }
    $full = Join-Path $root $relPath
    if (Test-Path $full -PathType Container) { $full = Join-Path $full "index.html" }

    if (Test-Path $full -PathType Leaf) {
        try {
            $bytes = [System.IO.File]::ReadAllBytes($full)
            $ext = [System.IO.Path]::GetExtension($full).ToLower()
            if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
            $ctx.Response.ContentLength64 = $bytes.Length
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {
            $ctx.Response.StatusCode = 500
        }
    } else {
        $ctx.Response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404: $relPath")
        $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.OutputStream.Close()
}
