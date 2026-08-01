import { connectToMongoDB } from '../server/db';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const isMongoConnected = await connectToMongoDB();
  res.status(200).json({
    status: 'ok',
    mongoDbConnected: isMongoConnected,
    timestamp: new Date().toISOString(),
  });
}
