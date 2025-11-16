import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const path = event.path.replace('/.netlify/functions/products', '');
    
    // GET /products - Récupérer tous les produits
    if (event.httpMethod === 'GET' && !path) {
      const products = await sql`SELECT * FROM products ORDER BY category, name`;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(products)
      };
    }

    // POST /products - Créer un nouveau produit
    if (event.httpMethod === 'POST') {
      const { name, category, unit, image } = JSON.parse(event.body);
      const id = 'p' + Date.now();
      
      await sql`
        INSERT INTO products (id, name, category, unit, image)
        VALUES (${id}, ${name}, ${category}, ${unit}, ${image})
      `;
      
      const [newProduct] = await sql`SELECT * FROM products WHERE id = ${id}`;
      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(newProduct)
      };
    }

    // PUT /products/:id - Mettre à jour un produit
    if (event.httpMethod === 'PUT') {
      const id = path.replace('/', '');
      const { name, category, unit, image } = JSON.parse(event.body);
      
      await sql`
        UPDATE products 
        SET name = ${name}, 
            category = ${category}, 
            unit = ${unit}, 
            image = ${image}
        WHERE id = ${id}
      `;
      
      const [updatedProduct] = await sql`SELECT * FROM products WHERE id = ${id}`;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(updatedProduct)
      };
    }

    // DELETE /products/:id - Supprimer un produit
    if (event.httpMethod === 'DELETE') {
      const id = path.replace('/', '');
      await sql`DELETE FROM products WHERE id = ${id}`;
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Route non trouvée' })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erreur serveur', details: error.message })
    };
  }
}