// Update fetch calls to include credentials

function fetchData() {
    return fetch('/api/services/data', { 
        method: 'GET', 
        credentials: 'include'
    })
    .then(response => response.json());
}

function postData(data) {
    return fetch('/api/services/data', { 
        method: 'POST', 
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json());
}