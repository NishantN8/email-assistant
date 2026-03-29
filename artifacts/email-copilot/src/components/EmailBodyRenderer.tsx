import { useRef, useState } from "react";

interface EmailBodyRendererProps {
  body?: string | null;
  snippet?: string | null;
}

export function EmailBodyRenderer({ body, snippet }: EmailBodyRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(300);
  const content = body || snippet || "";
  const isHtml = /^\s*(<(!DOCTYPE|html|head|body|table|div|span|p|meta|style|link)\b|<\?xml)/i.test(content);

  const htmlDoc = isHtml
    ? `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: #0d0d0f !important;
    color: #e4e4e7 !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.6;
    overflow-x: hidden;
  }
  a { color: #818cf8; }
  img { max-width: 100%; height: auto; border-radius: 4px; }
  table { max-width: 100% !important; }
  td, th { word-break: break-word; }
  table[bgcolor], td[bgcolor], div[style*="background"] {
    background: transparent !important;
  }
</style>
</head>
<body>${content}</body>
</html>`
    : "";

  const handleIframeLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.body) {
        const h = doc.body.scrollHeight;
        setIframeHeight(Math.max(h + 24, 100));
      }
    } catch (_) {}
  };

  if (isHtml) {
    return (
      <iframe
        ref={iframeRef}
        srcDoc={htmlDoc}
        sandbox="allow-same-origin"
        onLoad={handleIframeLoad}
        style={{ height: iframeHeight }}
        className="w-full border-0 rounded-lg block"
        title="Email content"
      />
    );
  }

  return (
    <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">
      {content}
    </div>
  );
}
