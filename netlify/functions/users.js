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
    const path = event.path.replace('/.netlify/functions/users', '');
    
    // GET /users - Récupérer tous les utilisateurs
    if (event.httpMethod === 'GET' && !path) {
      const users = await sql`SELECT * FROM users ORDER BY created_at DESC`;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(users)
      };
    }

    // POST /users/login - Connexion
    if (event.httpMethod === 'POST' && path === '/login') {
      const { username, password } = JSON.parse(event.body);
      const [user] = await sql`
        SELECT * FROM users 
        WHERE username = ${username} AND password = ${password}
      `;
      
      if (user) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(user)
        };
      } else {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Identifiants incorrects' })
        };
      }
    }

    // POST /users - Créer un nouveau client
    if (event.httpMethod === 'POST' && !path) {
      const { username, password, email, name, phone, address } = JSON.parse(event.body);
      const id = 'client' + Date.now();
      
      try {
        // Créer l'utilisateur
        await sql`
          INSERT INTO users (id, username, password, role, email, name, phone, address)
          VALUES (${id}, ${username}, ${password}, 'client', ${email}, ${name}, ${phone}, ${address})
        `;
        
        // Récupérer tous les produits
        const products = await sql`SELECT id FROM products`;
        
        console.log(`Assigning ${products.length} products to client ${id}`);
        
        // Assigner tous les produits au nouveau client par lots de 100
        if (products.length > 0) {
          const batchSize = 100;
          let assignedCount = 0;
          
          for (let i = 0; i < products.length; i += batchSize) {
            const batch = products.slice(i, i + batchSize);
            
            // Préparer les promesses pour ce lot
            const promises = batch.map(product => 
              sql`
                INSERT INTO assignments (client_id, product_id)
                VALUES (${id}, ${product.id})
                ON CONFLICT (client_id, product_id) DO NOTHING
              `.catch(err => {
                console.log(`Error assigning product ${product.id}:`, err.message);
                return null;
              })
            );
            
            // Exécuter toutes les insertions du lot en parallèle
            await Promise.all(promises);
            assignedCount += batch.length;
            console.log(`Assigned ${assignedCount}/${products.length} products`);
          }
          
          console.log(`Successfully assigned all ${products.length} products to client ${id}`);
        }
        
        const [newUser] = await sql`SELECT * FROM users WHERE id = ${id}`;
        return {
          statusCode: 201,
          headers,
          body: JSON.stringify({
            ...newUser,
            products_assigned: products.length
          })
        };
      } catch (error) {
        console.error('Error creating client:', error);
        // Si une erreur survient, supprimer le client créé
        try {
          await sql`DELETE FROM users WHERE id = ${id}`;
        } catch (deleteError) {
          console.error('Error deleting client after failure:', deleteError);
        }
        throw error;
      }
    }

    // PUT /users/:id - Mettre à jour un utilisateur
    if (event.httpMethod === 'PUT') {
      const id = path.replace('/', '');
      const { username, password, email, name, phone, address } = JSON.parse(event.body);
      
      await sql`
        UPDATE users 
        SET username = ${username}, 
            password = ${password}, 
            email = ${email}, 
            name = ${name}, 
            phone = ${phone}, 
            address = ${address}
        WHERE id = ${id}
      `;
      
      const [updatedUser] = await sql`SELECT * FROM users WHERE id = ${id}`;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(updatedUser)
      };
    }

    // DELETE /users/:id - Supprimer un utilisateur
    if (event.httpMethod === 'DELETE') {
      const id = path.replace('/', '');
      await sql`DELETE FROM users WHERE id = ${id}`;
      
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