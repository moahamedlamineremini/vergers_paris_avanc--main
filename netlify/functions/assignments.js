import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const path = event.path.replace('/.netlify/functions/assignments', '');
    
    // GET /assignments - Récupérer toutes les attributions
    if (event.httpMethod === 'GET' && !path) {
      const assignments = await sql`
        SELECT a.*, u.name as client_name, u.username, p.name as product_name 
        FROM assignments a
        JOIN users u ON a.client_id = u.id
        JOIN products p ON a.product_id = p.id
        ORDER BY u.name, p.name
      `;
      
      // Reformater pour correspondre à la structure originale
      const assignmentsByClient = {};
      for (const assignment of assignments) {
        if (!assignmentsByClient[assignment.client_id]) {
          assignmentsByClient[assignment.client_id] = [];
        }
        assignmentsByClient[assignment.client_id].push(assignment.product_id);
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(assignmentsByClient)
      };
    }

    // GET /assignments/:clientId - Récupérer les produits d'un client
    if (event.httpMethod === 'GET' && path) {
      const clientId = path.replace('/', '');
      const assignments = await sql`
        SELECT p.* FROM products p
        JOIN assignments a ON p.id = a.product_id
        WHERE a.client_id = ${clientId}
        ORDER BY p.category, p.name
      `;
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(assignments)
      };
    }

    // POST /assignments - Ajouter une attribution
    if (event.httpMethod === 'POST') {
      const { client_id, product_id } = JSON.parse(event.body);
      
      try {
        await sql`
          INSERT INTO assignments (client_id, product_id)
          VALUES (${client_id}, ${product_id})
        `;
        return {
          statusCode: 201,
          headers,
          body: JSON.stringify({ success: true })
        };
      } catch (error) {
        // Si l'attribution existe déjà
        if (error.code === '23505') {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Attribution déjà existante' })
          };
        }
        throw error;
      }
    }

    // DELETE /assignments/:clientId/:productId - Supprimer une attribution
    if (event.httpMethod === 'DELETE') {
      const pathParts = path.split('/').filter(p => p);
      if (pathParts.length === 2) {
        const [clientId, productId] = pathParts;
        
        await sql`
          DELETE FROM assignments 
          WHERE client_id = ${clientId} AND product_id = ${productId}
        `;
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true })
        };
      }
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