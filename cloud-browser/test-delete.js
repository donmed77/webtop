const http = require('http');
const { io } = require('socket.io-client');

// Step 1: Create a session via POST
const postData = JSON.stringify({ url: 'https://example.com' });
const req = http.request({ hostname: '127.0.0.1', port: 3005, path: '/api/session', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': postData.length }}, res => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        const { queueId } = JSON.parse(data);
        console.log('Queue ID:', queueId);

        // Step 2: Connect WebSocket and join queue
        const socket = io('http://127.0.0.1:3005', { reconnection: false });
        socket.on('connect', () => {
            socket.emit('queue:join', { queueId });
        });
        socket.on('queue:ready', (qData) => {
            const sessionId = qData.sessionId;
            console.log('Session ID:', sessionId);

            // Step 3: Join session to get the token
            socket.emit('session:join', { sessionId });
        });
        socket.on('session:joined', (sData) => {
            const { sessionId, sessionToken } = sData;
            console.log('Token:', sessionToken ? sessionToken.substring(0, 8) + '...' : 'NULL');

            // Step 4: Test DELETE with WRONG token
            const wrongReq = http.request({ hostname: '127.0.0.1', port: 3005, path: `/api/session/${sessionId}`, method: 'DELETE', headers: { 'x-session-token': 'wrong-token' }}, r => {
                let d = ''; r.on('data', c => d += c);
                r.on('end', () => { console.log('Wrong token:', r.statusCode, d); });
            });
            wrongReq.end();

            // Step 5: Test DELETE with NO token
            const noReq = http.request({ hostname: '127.0.0.1', port: 3005, path: `/api/session/${sessionId}`, method: 'DELETE' }, r => {
                let d = ''; r.on('data', c => d += c);
                r.on('end', () => { console.log('No token:', r.statusCode, d); });
            });
            noReq.end();

            // Step 6: Test DELETE with CORRECT token
            setTimeout(() => {
                const goodReq = http.request({ hostname: '127.0.0.1', port: 3005, path: `/api/session/${sessionId}`, method: 'DELETE', headers: { 'x-session-token': sessionToken }}, r => {
                    let d = ''; r.on('data', c => d += c);
                    r.on('end', () => {
                        console.log('Correct token:', r.statusCode, d);
                        socket.disconnect();
                        process.exit(0);
                    });
                });
                goodReq.end();
            }, 1000);
        });
        setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 30000);
    });
});
req.write(postData);
req.end();
