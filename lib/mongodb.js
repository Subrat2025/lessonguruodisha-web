import { MongoClient } from 'mongodb'

const uri = process.env.MONGO_URL
const dbName = process.env.DB_NAME

let cached = global._mongoClient
if (!cached) {
  cached = global._mongoClient = { client: null, promise: null }
}

export async function getDb() {
  if (cached.client) return cached.client.db(dbName)
  if (!cached.promise) {
    cached.promise = MongoClient.connect(uri, {
      maxPoolSize: 10,
    }).then((c) => {
      cached.client = c
      return c
    })
  }
  const client = await cached.promise
  return client.db(dbName)
}
