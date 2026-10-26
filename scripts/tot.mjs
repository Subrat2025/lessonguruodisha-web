import { MongoClient } from 'mongodb'
const c=new MongoClient(process.env.MONGO_URL);await c.connect();const db=c.db(process.env.DB_NAME)
console.log('total unit_test:', await db.collection('storeProducts').countDocuments({type:'unit_test'}))
console.log('total packs:', await db.collection('storeProducts').countDocuments({type:'unit_test_pack'}))
