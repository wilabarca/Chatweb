const WebSocket = require('ws');
const { MongoClient } = require('mongodb');

// Configuración de MongoDB
const uri = "mongodb://localhost:27017";
const dbName = "chat";
let db, messagesCollection;

// Conectar a MongoDB y asegurarse de que la colección exista
MongoClient.connect(uri)
  .then(async (client) => {
    console.log("Conectado a MongoDB");
    db = client.db(dbName);

    // Verificar si la colección "messages" existe, si no, crearla
    const collections = await db.listCollections({ name: "messages" }).toArray();
    if (collections.length === 0) {
      await db.createCollection("messages");
      console.log("Colección 'messages' creada.");
    } else {
      console.log("Colección 'messages' ya existe.");
    }

    messagesCollection = db.collection("messages");
  })
  .catch((err) => {
    console.error("Error al conectar con MongoDB:", err.message);
  });

// Configuración del servidor WebSocket
const server = new WebSocket.Server({ port: 8080 });
const clients = new Set();

// Manejar conexiones de nuevos clientes
server.on('connection', async (ws) => {
  clients.add(ws);
  console.log("Cliente conectado.");

  // Enviar los mensajes almacenados al nuevo cliente conectado
  try {
    const messages = await messagesCollection.find().sort({ timestamp: 1 }).toArray(); // Ordenados por fecha
    ws.send(JSON.stringify({ type: 'history', messages }));
  } catch (error) {
    console.error("Error al obtener mensajes de MongoDB:", error.message);
  }

  // Manejar mensajes entrantes
  ws.on('message', async (message) => {
    console.log(`Mensaje recibido: ${message}`);
    const textMessage = message.toString(); 
    // Guardar el mensaje en la base de datos
    try {
      const savedMessage = await messagesCollection.insertOne({ message:textMessage, timestamp: new Date() });
      console.log("Mensaje guardado en MongoDB:", savedMessage.insertedId);
    } catch (error) {
      console.error("Error al guardar el mensaje en MongoDB:", error.message);
    }

    //Enviar mensaje a clientes conectado
    const dataToSend = JSON.stringify({
      type: "new_message",
      message: textMessage,
      timestamp: new Date().toISOString()
    });
    // Enviar el mensaje a todos los clientes conectados
    for (let client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(dataToSend);
      }
    }
  });

  // Manejar la desconexión del cliente
  ws.on('close', () => {
    clients.delete(ws);
    console.log("Cliente desconectado.");
    for (let client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send("Un cliente se ha desconectado.");
      }
    }
  });

  // Manejar errores en el WebSocket
  ws.on('error', (error) => {
    console.error(`Error en WebSocket: ${error.message}`);
    for (let client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(`Error en el servidor: ${error.message}`);
      }
    }
  });
});

console.log("Servidor WebSocket escuchando en ws://localhost:8080");
