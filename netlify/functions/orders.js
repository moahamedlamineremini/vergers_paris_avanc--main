import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import PDFDocument from 'pdfkit';

const sql = neon(process.env.DATABASE_URL);
const resend = new Resend(process.env.RESEND_API_KEY);

// Fonction pour générer le PDF avec PDFKit
function generateOrderPDF(order, products) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });
    doc.on('error', reject);

    // Titre
    doc.fontSize(20).font('Helvetica-Bold').text('Bon de commande', { align: 'center' });
    doc.moveDown();

    // Informations commande
    doc.fontSize(10).font('Helvetica-Bold').text(`Numéro de commande: ${order.id}`, 50, 80);
    doc.font('Helvetica').text(`Date: ${new Date(order.order_date).toLocaleDateString('fr-FR')}`, 50, 95);
    doc.font('Helvetica-Bold').text(`Livraison souhaitée: ${new Date(order.delivery_date).toLocaleDateString('fr-FR')}`, 50, 110);
    
    doc.moveDown(2);

    // Ligne de séparation
    doc.moveTo(50, 140).lineTo(550, 140).stroke();
    doc.moveDown();

    // Adresse fournisseur
    doc.fontSize(10).font('Helvetica-Bold').text('Fournisseur:', 50, 160);
    doc.font('Helvetica').text('LES VERGERS DE PARIS', 50, 175);
    doc.text('104 rue d\'angers', 50, 190);
    doc.text('94584 RUNGIS CEDEX', 50, 205);
    doc.text('France', 50, 220);

    // Adresse livraison
    doc.font('Helvetica-Bold').text('Livraison:', 350, 160);
    doc.fontSize(12).font('Helvetica-Bold').text(order.client_name, 350, 175);
    doc.fontSize(10).font('Helvetica');
    if (order.client_address) {
      doc.text(order.client_address, 350, 192, { width: 200 });
    }
    if (order.client_phone) {
      doc.text(`Tél: ${order.client_phone}`, 350, 220);
    }

    doc.moveDown(3);

    // Grouper les produits par catégorie
    const itemsByCategory = {};
    order.items.forEach(item => {
      const product = products.find(p => p.id === item.product_id);
      const category = product ? product.category : 'Autre';
      if (!itemsByCategory[category]) {
        itemsByCategory[category] = [];
      }
      itemsByCategory[category].push(item);
    });

    // Trier les catégories par numéro
    const sortedCategories = Object.keys(itemsByCategory).sort((a, b) => {
      const numA = parseInt(a.split(':')[0]);
      const numB = parseInt(b.split(':')[0]);
      return numA - numB;
    });

    // Afficher les produits par catégorie
    let yPosition = 270;

    sortedCategories.forEach((category, index) => {
      // Nom de la catégorie
      const categoryName = category.split(':')[1]?.trim() || category;
      
      if (yPosition > 700) {
        doc.addPage();
        yPosition = 50;
      }

      // Titre de catégorie en vert
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#15803d').text(categoryName.toUpperCase(), 50, yPosition);
      yPosition += 20;

      // En-tête du tableau
      doc.fontSize(10).fillColor('#000000');
      doc.font('Helvetica-Bold');
      doc.text('Article', 50, yPosition);
      doc.text('Quantité', 300, yPosition, { width: 80, align: 'center' });
      doc.text('Conditionnement', 390, yPosition);

      // Ligne sous l'en-tête
      yPosition += 15;
      doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
      yPosition += 10;

      // Produits de cette catégorie
      doc.font('Helvetica').fontSize(9);
      itemsByCategory[category].forEach(item => {
        if (yPosition > 700) {
          doc.addPage();
          yPosition = 50;
        }
        
        doc.text(item.product_name, 50, yPosition, { width: 240, ellipsis: true });
        doc.text(item.quantity.toString(), 300, yPosition, { width: 80, align: 'center' });
        doc.text(item.unit, 390, yPosition, { width: 150 });
        
        yPosition += 20;
      });

      // Ligne de fin de catégorie
      doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
      yPosition += 15;
    });

    // Commentaire
    if (order.comment) {
      yPosition += 15;
      if (yPosition > 700) {
        doc.addPage();
        yPosition = 50;
      }
      doc.font('Helvetica-Bold').text('Commentaire:', 50, yPosition);
      yPosition += 15;
      doc.font('Helvetica').text(order.comment, 50, yPosition, { width: 500 });
    }

    doc.end();
  });
}

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
    const path = event.path.replace('/.netlify/functions/orders', '');
    
    // GET /orders - Récupérer toutes les commandes
    if (event.httpMethod === 'GET' && !path) {
      const orders = await sql`
        SELECT * FROM orders 
        ORDER BY order_date DESC
      `;
      
      // Récupérer les items pour chaque commande
      for (const order of orders) {
        const items = await sql`
          SELECT * FROM order_items 
          WHERE order_id = ${order.id}
        `;
        order.items = items;
        order.date = new Date(order.order_date).toLocaleString('fr-FR');
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(orders)
      };
    }

    // POST /orders - Créer une nouvelle commande
    if (event.httpMethod === 'POST' && !path) {
      const { 
        clientId, 
        clientName, 
        clientEmail, 
        clientPhone, 
        clientAddress, 
        items, 
        deliveryDate, 
        comment 
      } = JSON.parse(event.body);
      
      const orderId = 'cmd' + Date.now();
      
      // Insérer la commande
      await sql`
        INSERT INTO orders (
          id, client_id, client_name, client_email, 
          client_phone, client_address, delivery_date, comment
        )
        VALUES (
          ${orderId}, ${clientId}, ${clientName}, ${clientEmail}, 
          ${clientPhone}, ${clientAddress}, ${deliveryDate}, ${comment}
        )
      `;
      
      // Insérer les items de la commande
      for (const item of items) {
        await sql`
          INSERT INTO order_items (
            order_id, product_id, product_name, 
            product_image, unit, quantity
          )
          VALUES (
            ${orderId}, ${item.id}, ${item.name}, 
            ${item.image}, ${item.unit}, ${item.quantity}
          )
        `;
      }
      
      // Récupérer la commande créée avec ses items
      const [newOrder] = await sql`SELECT * FROM orders WHERE id = ${orderId}`;
      const orderItems = await sql`
        SELECT * FROM order_items WHERE order_id = ${orderId}
      `;
      newOrder.items = orderItems;
      newOrder.date = new Date(newOrder.order_date).toLocaleString('fr-FR');
      
      // Récupérer les produits pour avoir les catégories
      const products = await sql`SELECT id, category FROM products`;
      
      // Générer le PDF avec catégories
      const pdfBuffer = await generateOrderPDF(newOrder, products);
      const pdfBase64 = pdfBuffer.toString('base64');
      
      // Grouper les produits par catégorie pour l'email
      const itemsByCategory = {};
      newOrder.items.forEach(item => {
        const product = products.find(p => p.id === item.product_id);
        const category = product ? product.category : 'Autre';
        if (!itemsByCategory[category]) {
          itemsByCategory[category] = [];
        }
        itemsByCategory[category].push(item);
      });

      // Trier les catégories
      const sortedCategories = Object.keys(itemsByCategory).sort((a, b) => {
        const numA = parseInt(a.split(':')[0]);
        const numB = parseInt(b.split(':')[0]);
        return numA - numB;
      });

      // Générer le HTML des produits par catégorie
      const productsListHtml = sortedCategories.map(category => {
        const categoryName = category.split(':')[1]?.trim() || category;
        const itemsHtml = itemsByCategory[category].map(item => 
          `<li style="margin: 5px 0;">${item.product_image} ${item.product_name} - ${item.quantity} ${item.unit}</li>`
        ).join('');
        
        return `
          <div style="margin: 15px 0;">
            <h4 style="color: #15803d; margin: 10px 0 5px 0;">${categoryName.toUpperCase()}</h4>
            <ul style="margin: 0; padding-left: 20px;">
              ${itemsHtml}
            </ul>
          </div>
        `;
      }).join('');
      
      // Envoyer l'email à l'admin UNIQUEMENT
      try {
        const adminEmail = 'vdp.rungis@hotmail.com'; // CHANGEZ CETTE ADRESSE PAR VOTRE EMAIL
        
        await resend.emails.send({
          from: 'Les Vergers de Paris <onboarding@resend.dev>',
          to: [adminEmail],
          subject: `${clientName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #15803d;">🥬🍊 Nouvelle commande reçue</h1>
              
              <p style="font-size: 18px;"><strong>Commande passée par ${clientName}</strong></p>
              
              <p>Veuillez trouver le bon de commande en pièce jointe.</p>
              
              <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #15803d;">
                <p style="margin: 5px 0;"><strong>📋 N° de commande:</strong> ${orderId}</p>
                <p style="margin: 5px 0;"><strong>👤 Client:</strong> ${clientName}</p>
                <p style="margin: 5px 0;"><strong>📧 Email:</strong> ${clientEmail}</p>
                ${clientPhone ? `<p style="margin: 5px 0;"><strong>📞 Téléphone:</strong> ${clientPhone}</p>` : ''}
                ${clientAddress ? `<p style="margin: 5px 0;"><strong>📍 Adresse de livraison:</strong> ${clientAddress}</p>` : ''}
                <p style="margin: 5px 0;"><strong>📅 Livraison souhaitée:</strong> ${new Date(deliveryDate).toLocaleDateString('fr-FR')}</p>
                <p style="margin: 5px 0;"><strong>🕐 Commandé le:</strong> ${new Date().toLocaleString('fr-FR')}</p>
              </div>
              
              <h3 style="color: #15803d; margin-top: 25px;">Produits commandés:</h3>
              ${productsListHtml}
              
              ${comment ? `
                <div style="background: #fff7ed; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0; font-weight: bold;">💬 Commentaire du client:</p>
                  <p style="margin: 10px 0 0 0;">${comment}</p>
                </div>
              ` : ''}
            </div>
          `,
          attachments: [
            {
              filename: `Bon_commande_${orderId}.pdf`,
              content: pdfBase64
            }
          ]
        });
        
        console.log('Email envoyé avec succès à l\'admin:', adminEmail);
      } catch (emailError) {
        console.error('Erreur lors de l\'envoi de l\'email:', emailError);
        // On ne fait pas échouer la commande si l'email ne part pas
      }
      
      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(newOrder)
      };
    }

    // DELETE /orders/:id - Supprimer une commande
    if (event.httpMethod === 'DELETE' && path) {
      const orderId = path.replace('/', '');
      
      // Supprimer d'abord les items de la commande
      await sql`
        DELETE FROM order_items 
        WHERE order_id = ${orderId}
      `;
      
      // Puis supprimer la commande
      await sql`
        DELETE FROM orders 
        WHERE id = ${orderId}
      `;
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Commande supprimée' })
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