// Client API pour Les Vergers de Paris
const API_BASE = '/.netlify/functions';

// Helper pour les requêtes
async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erreur serveur');
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// API Users
const usersAPI = {
    login: async (username, password) => {
        return apiRequest('/users/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    },
    
    getAll: async () => {
        return apiRequest('/users');
    },
    
    create: async (userData) => {
        return apiRequest('/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    },
    
    update: async (id, userData) => {
        return apiRequest(`/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(userData)
        });
    },
    
    delete: async (id) => {
        return apiRequest(`/users/${id}`, {
            method: 'DELETE'
        });
    }
};

// API Products
const productsAPI = {
    getAll: async () => {
        return apiRequest('/products');
    },
    
    create: async (productData) => {
        return apiRequest('/products', {
            method: 'POST',
            body: JSON.stringify(productData)
        });
    },
    
    update: async (id, productData) => {
        return apiRequest(`/products/${id}`, {
            method: 'PUT',
            body: JSON.stringify(productData)
        });
    },
    
    delete: async (id) => {
        return apiRequest(`/products/${id}`, {
            method: 'DELETE'
        });
    }
};

// API Assignments
const assignmentsAPI = {
    getAll: async () => {
        return apiRequest('/assignments');
    },
    
    getByClient: async (clientId) => {
        return apiRequest(`/assignments/${clientId}`);
    },
    
    create: async (clientId, productId) => {
        return apiRequest('/assignments', {
            method: 'POST',
            body: JSON.stringify({ client_id: clientId, product_id: productId })
        });
    },
    
    delete: async (clientId, productId) => {
        return apiRequest(`/assignments/${clientId}/${productId}`, {
            method: 'DELETE'
        });
    }
};

// API Orders
const ordersAPI = {
    getAll: async () => {
        return apiRequest('/orders');
    },
    
    create: async (orderData) => {
        return apiRequest('/orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
    }
};