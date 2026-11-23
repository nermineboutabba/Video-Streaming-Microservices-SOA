const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const db = require('./db');
const path = require('path');
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
    clientId: 'interaction-service',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
    retry: { initialRetryTime: 200, retries: 1 }
});
const producer = kafka.producer();
let kafkaReady = false;

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'interaction.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
const interactionProto = grpc.loadPackageDefinition(packageDefinition).interaction;

const server = new grpc.Server();

async function sendEvent(topic, data) {
    if (!kafkaReady) {
        console.log(`[local-fallback] ${topic}:`, JSON.stringify(data));
        return;
    }
    try {
        await producer.send({
            topic,
            messages: [
                { value: JSON.stringify(data) }
            ]
        });
        console.log(`[kafka] Event sent: ${topic}`);
    } catch (err) {
        console.log(`[kafka] Send skipped (${topic}):`, err.message);
    }
}

// Fonction de validation pour les IDs
function validateId(id, fieldName) {
    if (!id || id === undefined || id === null) {
        return `${fieldName} est requis`;
    }
    if (typeof id === 'string' && id.trim() === '') {
        return `${fieldName} ne peut pas être vide`;
    }
    if (typeof id === 'number' && id <= 0) {
        return `${fieldName} doit être un nombre positif`;
    }
    return null;
}

server.addService(interactionProto.InteractionService.service, {
    AddComment: (call, callback) => {
        const { videoId, userId, content } = call.request;

        // Validations
        const videoIdError = validateId(videoId, 'videoId');
        const userIdError = validateId(userId, 'userId');

        if (videoIdError) {
            return callback({
                code: grpc.status.INVALID_ARGUMENT,
                message: videoIdError,
                details: "Paramètre invalide"
            });
        }

        if (userIdError) {
            return callback({
                code: grpc.status.INVALID_ARGUMENT,
                message: userIdError,
                details: "Paramètre invalide"
            });
        }

        if (!content || content.trim() === '') {
            return callback({
                code: grpc.status.INVALID_ARGUMENT,
                message: "Le contenu du commentaire ne peut pas être vide",
                details: "Paramètre invalide"
            });
        }

        db.run("INSERT INTO comments (videoId, userId, content) VALUES (?, ?, ?)",
            [videoId, userId, content],
            function (err) {
                if (err) {
                    console.error("Erreur DB:", err);
                    return callback({
                        code: grpc.status.INTERNAL,
                        message: "Erreur lors de l'ajout du commentaire: " + err.message
                    });
                }
                sendEvent('comment.added', {
                    videoId,
                    userId,
                    content
                });
                callback(null, {
                    id: this.lastID.toString(),
                    message: "Commentaire ajouté avec succès !"
                });
            }
        );
    },

    GetComments: (call, callback) => {
        const { videoId } = call.request;

        // Validation
        const videoIdError = validateId(videoId, 'videoId');
        if (videoIdError) {
            return callback({
                code: grpc.status.INVALID_ARGUMENT,
                message: videoIdError
            });
        }

        db.all("SELECT id, userId, content FROM comments WHERE videoId = ?", [videoId], (err, rows) => {
            if (err) {
                return callback({
                    code: grpc.status.INTERNAL,
                    message: "Erreur lors de la récupération des commentaires"
                });
            }
            callback(null, { comments: rows || [] });
        });
    },

    LikeVideo: (call, callback) => {
        const { videoId, userId } = call.request;

        // Validations
        const videoIdError = validateId(videoId, 'videoId');
        const userIdError = validateId(userId, 'userId');

        if (videoIdError) {
            return callback({
                code: grpc.status.INVALID_ARGUMENT,
                message: videoIdError,
                details: "Paramètre invalide"
            });
        }

        if (userIdError) {
            return callback({
                code: grpc.status.INVALID_ARGUMENT,
                message: userIdError,
                details: "Paramètre invalide"
            });
        }

        // Vérifier si l'utilisateur a déjà liké cette vidéo
        db.get("SELECT * FROM likes WHERE videoId = ? AND userId = ?", [videoId, userId], (err, existing) => {
            if (err) {
                return callback({
                    code: grpc.status.INTERNAL,
                    message: "Erreur lors de la vérification du like"
                });
            }

            if (existing) {
                return callback({
                    code: grpc.status.ALREADY_EXISTS,
                    message: "Vous avez déjà liké cette vidéo"
                });
            }

            db.run("INSERT INTO likes (videoId, userId) VALUES (?, ?)", [videoId, userId], function (err) {
                if (err) {
                    return callback({
                        code: grpc.status.INTERNAL,
                        message: "Erreur lors de l'ajout du like: " + err.message
                    });
                }

                db.get("SELECT COUNT(*) as total FROM likes WHERE videoId = ?", [videoId], (err, row) => {
                    sendEvent('video.liked', {
                        videoId,
                        userId
                    });
                    callback(null, {
                        message: "Like ajouté avec succès !",
                        totalLikes: row ? row.total : 0
                    });
                });
            });
        });
    }
});

async function run() {
    try {
        await producer.connect();
        kafkaReady = true;
        console.log("[kafka] Producer connected (9092)");
    } catch (err) {
        kafkaReady = false;
        console.log("[kafka] Broker offline, running in local gRPC mode:", err.message);
    }
    server.bindAsync('0.0.0.0:50053', grpc.ServerCredentials.createInsecure(), () => {
        console.log("Interaction Service ready on port 50053");
        server.start();
    });
}
run().catch(console.error);