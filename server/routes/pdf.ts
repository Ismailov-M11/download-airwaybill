import { RequestHandler } from "express";

/**
 * PDF proxy endpoint to handle cross-domain cookie issues
 * Streams PDF from admin.fargo.uz with proper authorization cookie
 */
export const handlePdfProxy: RequestHandler = async (req, res) => {
  try {
    const ids = String(req.query.ids || '');
    const token = String(req.query.token || '');

    // Validate required parameters
    if (!ids) {
      res.status(400).json({ error: 'Missing ids parameter' });
      return;
    }

    if (!token) {
      res.status(400).json({ error: 'Missing token parameter' });
      return;
    }

    // Build upstream URL
    const url = `https://admin.fargo.uz/file/order/airwaybill_mini?ids=${ids}`;

    console.log(`📄 PDF Proxy: fetching ${ids.split('%2C').length} airwaybills`);

    // Make request to upstream server with authorization cookie
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': `w-jwt=${token}`,
        'Accept': 'application/pdf',
        'User-Agent': 'PDF-Proxy/1.0'
      }
    });

    // Handle upstream errors
    if (!response.ok) {
      console.error(`PDF Proxy error: ${response.status} ${response.statusText}`);
      
      if (response.status === 401) {
        res.status(401).json({ error: 'Authorization failed - token may be expired' });
        return;
      }
      
      // Try to get error text
      const errorText = await response.text().catch(() => 'Unknown error');
      res.status(response.status).json({ 
        error: `Upstream server error: ${response.status} ${response.statusText}`,
        details: errorText 
      });
      return;
    }

    // Check content type
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/pdf')) {
      console.warn(`PDF Proxy warning: unexpected content-type: ${contentType}`);
    }

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="airwaybills.pdf"');
    
    // Copy content-length if available
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // Stream the PDF response
    if (response.body) {
      const reader = response.body.getReader();
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          res.write(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
    }

    res.end();
    console.log(`✅ PDF Proxy: successfully streamed PDF`);

  } catch (error) {
    console.error('PDF Proxy error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
};
