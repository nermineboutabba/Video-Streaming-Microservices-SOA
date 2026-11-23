const { Kafka } = require('kafkajs');

const kafka = new Kafka({
    clientId: 'video-service',
    brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
    retry: { initialRetryTime: 200, retries: 1 }
});

module.exports = kafka;