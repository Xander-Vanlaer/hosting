fetch('/api/deploy', {
    method: 'POST',
    credentials: 'include', // Added to send session cookies
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
})