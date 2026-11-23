const { ApolloServer } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const net = require('net');

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use('/demo', express.static(path.resolve(__dirname, '../demo-ui')));
app.get('/', (req, res) => res.redirect('/demo'));

// Load gRPC proto definitions
const interactionProtoPath = path.resolve(__dirname, '../proto/interaction.proto');
const userProtoPath = path.resolve(__dirname, '../proto/user.proto');
const videoProtoPath = path.resolve(__dirname, '../proto/video.proto');

const interactionPackage = protoLoader.loadSync(interactionProtoPath);
const userPackage = protoLoader.loadSync(userProtoPath);
const videoPackage = protoLoader.loadSync(videoProtoPath);

const interactionProto = grpc.loadPackageDefinition(interactionPackage).interaction;
const userProto = grpc.loadPackageDefinition(userPackage).user;
const videoProto = grpc.loadPackageDefinition(videoPackage).video;

// Create gRPC service clients
const interactionClient =
    new interactionProto.InteractionService(
        'localhost:50053',
        grpc.credentials.createInsecure()
    );

const userClient =
    new userProto.UserService(
        'localhost:50051',
        grpc.credentials.createInsecure()
    );

const videoClient =
    new videoProto.VideoService(
        'localhost:50052',
        grpc.credentials.createInsecure()
    );

// REST routes: Users
// REGISTER
app.post('/api/register', (req, res) => {

    userClient.Register(req.body, (err, response) => {

        if (err) {
            return res.status(500).json(err);
        }

        res.json(response);
    });
});

// LOGIN
app.post('/api/login', (req, res) => {

    userClient.Login(req.body, (err, response) => {

        if (err) {
            return res.status(500).json(err);
        }

        res.json(response);
    });
});

// GET USER
app.get('/api/users/:id', (req, res) => {

    userClient.GetUser(
        { user_id: req.params.id },
        (err, response) => {

            if (err) {
                return res.status(500).json(err);
            }

            res.json(response);
        }
    );
});

app.put('/api/users/:id', (req, res) => {

    userClient.UpdateUser(
        {
            user_id: req.params.id,
            username: req.body.username,
            email: req.body.email
        },
        (err, response) => {

            if (err) {
                return res.status(500).json(err);
            }

            res.json(response);
        }
    );
});

app.post('/api/follow', (req, res) => {

    userClient.FollowUser(req.body, (err, response) => {

        if (err) {
            return res.status(500).json(err);
        }

        res.json(response);
    });
});

app.get('/api/followers/:id', (req, res) => {

    userClient.GetFollowers(
        { user_id: req.params.id },
        (err, response) => {

            if (err) {
                return res.status(500).json(err);
            }

            res.json(response);
        }
    );
});

// REST routes: Videos

// LIST VIDEOS
app.get('/api/videos', (req, res) => {

    videoClient.ListVideos({}, (err, response) => {

        if (err) {
            return res.status(500).json(err);
        }

        res.json(response);
    });
});

// GET LATEST VIDEOS
app.get('/api/videos/latest', (req, res) => {

    videoClient.GetLatestVideos(
        {},
        (err, response) => {

            if (err) {
                return res.status(500).json(err);
            }

            res.json(response);
        }
    );
});

// GET TRENDING VIDEOS
app.get('/api/videos/trending', (req, res) => {

    videoClient.GetTrendingVideos(
        {},
        (err, response) => {

            if (err) {
                return res.status(500).json(err);
            }

            res.json(response);
        }
    );
});

// GET VIDEO
app.get('/api/videos/:id', (req, res) => {

    videoClient.GetVideo(
        { id: parseInt(req.params.id) },
        (err, response) => {

            if (err) {
                return res.status(500).json(err);
            }

            res.json(response);
        }
    );
});

// SEARCH VIDEOS
app.get('/api/search/:query', (req, res) => {

    videoClient.SearchVideos(
        { query: req.params.query },
        (err, response) => {

            if (err) {
                return res.status(500).json(err);
            }

            res.json(response);
        }
    );
});

// DELETE VIDEO
app.delete('/api/videos/:id', (req, res) => {

    videoClient.DeleteVideo(
        { id: parseInt(req.params.id) },
        (err, response) => {

            if (err) {
                return res.status(500).json(err);
            }

            res.json(response);
        }
    );
});

// REST routes: Interactions

// Fonction helper pour gérer les erreurs gRPC
function handleGrpcError(err, res) {
    console.error('gRPC Error:', err);
    
    let statusCode = 400;
    let errorMessage = err.message || 'Une erreur est survenue';
    
    // Gérer les différents codes d'erreur gRPC
    if (err.code === 3) { // INVALID_ARGUMENT
        statusCode = 400;
        errorMessage = err.message || 'Paramètres invalides';
    } else if (err.code === 6) { // ALREADY_EXISTS
        statusCode = 409;
        errorMessage = err.message || 'Ressource déjà existante';
    } else if (err.code === 5) { // NOT_FOUND
        statusCode = 404;
        errorMessage = err.message || 'Ressource non trouvée';
    } else if (err.code === 13) { // INTERNAL
        statusCode = 500;
        errorMessage = 'Erreur interne du serveur';
    }
    
    return res.status(statusCode).json({ 
        success: false,
        error: errorMessage,
        code: err.code
    });
}

// ADD COMMENT
app.post('/api/comments', (req, res) => {
    const { videoId, userId, content } = req.body;
    
    // Validation côté gateway avant d'appeler gRPC
    if (!videoId || videoId.trim() === '') {
        return res.status(400).json({ 
            success: false,
            error: "videoId est requis et ne peut pas être vide" 
        });
    }
    
    if (!userId || userId.trim() === '') {
        return res.status(400).json({ 
            success: false,
            error: "userId est requis et ne peut pas être vide" 
        });
    }
    
    if (!content || content.trim() === '') {
        return res.status(400).json({ 
            success: false,
            error: "Le contenu du commentaire ne peut pas être vide" 
        });
    }
    
    interactionClient.AddComment(req.body, (err, response) => {
        if (err) {
            return handleGrpcError(err, res);
        }
        res.status(201).json({ 
            success: true,
            ...response 
        });
    });
});

// LIKE VIDEO
app.post('/api/like', (req, res) => {
    const { videoId, userId } = req.body;
    
    // Validation côté gateway avant d'appeler gRPC
    if (!videoId || videoId.trim() === '') {
        return res.status(400).json({ 
            success: false,
            error: "videoId est requis et ne peut pas être vide" 
        });
    }
    
    if (!userId || userId.trim() === '') {
        return res.status(400).json({ 
            success: false,
            error: "userId est requis et ne peut pas être vide" 
        });
    }
    
    interactionClient.LikeVideo(req.body, (err, response) => {
        if (err) {
            return handleGrpcError(err, res);
        }
        res.json({ 
            success: true,
            ...response 
        });
    });
});

// GET COMMENTS FOR A VIDEO
app.get('/api/comments/:videoId', (req, res) => {

    interactionClient.GetComments(
        { videoId: req.params.videoId },
        (err, response) => {

            if (err) {
                return res.status(500).json(err);
            }

            res.json(response);
        }
    );
});

// CREATE VIDEO METADATA VIA gRPC (useful for live demo seeding/testing)
app.post('/api/videos', (req, res) => {
    const { title, description, category, filename, filepath, creatorId } = req.body;
    if (!title || !title.trim()) {
        return res.status(400).json({ success: false, error: 'title is required' });
    }
    videoClient.CreateVideo(
        {
            title: title.trim(),
            description: description || 'Uploaded via StreamMesh API Console',
            category: category || 'Architecture',
            filename: filename || 'sample-stream.mp4',
            filepath: filepath || '/uploads/sample-stream.mp4',
            creatorId: parseInt(creatorId, 10) || 1
        },
        (err, response) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            res.status(201).json({ success: true, video: response });
        }
    );
});

// MESH HEALTH CHECK (probes TCP ports for all backend services)
function probePort(port, host = '127.0.0.1') {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(500);
        socket.once('connect', () => { socket.destroy(); resolve('online'); });
        socket.once('timeout', () => { socket.destroy(); resolve('offline'); });
        socket.once('error', () => { socket.destroy(); resolve('offline'); });
        socket.connect(port, host);
    });
}

app.get('/api/health', async (req, res) => {
    const [graphql, userGrpc, videoGrpc, videoHttp, interactionGrpc, kafka] = await Promise.all([
        probePort(4000),
        probePort(50051),
        probePort(50052),
        probePort(3002),
        probePort(50053),
        probePort(9092)
    ]);
    res.json({
        gatewayRest: 'online',
        graphql,
        userGrpc,
        videoGrpc,
        videoHttp,
        interactionGrpc,
        kafka,
        kafkaMode: kafka === 'online' ? 'broker-connected' : 'graceful-local-fallback'
    });
});

// Start Express REST server
app.listen(3001, () => {
    console.log('API Gateway running on port 3001');
});

// Apollo GraphQL gateway

const typeDefs = `#graphql

type Comment {
    id: String
    userId: String
    content: String
}

type Video {
    id: Int
    title: String
    description: String
    category: String
    filename: String
    filepath: String
    creatorId: Int
    views: Int
    likes: Int
    comments: [Comment]
    createdAt: String
}

type Query {

    getVideoComments(videoId: String!): [Comment]

    getVideos: [Video]

    getTrendingVideos: [Video]

    getLatestVideos: [Video]
}
`;

const resolvers = {

    Query: {

        getVideoComments: async (_, { videoId }) => {

            return new Promise((resolve, reject) => {

                interactionClient.GetComments(
                    { videoId },
                    (err, response) => {

                        if (err) reject(err);

                        else resolve(response.comments || []);
                    }
                );
            });
        },

        getVideos: async () => {

            return new Promise((resolve, reject) => {

                videoClient.ListVideos(
                    {},
                    (err, response) => {

                        if (err) reject(err);

                        else resolve(response.videos || []);
                    }
                );
            });
        },

        getTrendingVideos: async () => {

            return new Promise((resolve, reject) => {

                videoClient.GetTrendingVideos(
                    {},
                    (err, response) => {

                        if (err) reject(err);

                        else resolve(response.videos || []);
                    }
                );
            });
        },

        getLatestVideos: async () => {

            return new Promise((resolve, reject) => {

                videoClient.GetLatestVideos(
                    {},
                    (err, response) => {

                        if (err) reject(err);

                        else resolve(response.videos || []);
                    }
                );
            });
        },
    },

    Video: {

        comments: async (parent) => {

            return new Promise((resolve, reject) => {

                interactionClient.GetComments(
                    { videoId: String(parent.id) },
                    (err, response) => {

                        if (err) reject(err);

                        else resolve(response.comments || []);
                    }
                );
            });
        }
    }
};

const server = new ApolloServer({
    typeDefs,
    resolvers
});

async function startGraphQL() {

    const { url } = await startStandaloneServer(server, {
        listen: { port: 4000 }
    });

    console.log(`GraphQL Gateway running at ${url}`);
}

startGraphQL();