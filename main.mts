import { request } from 'undici';
const response = await request(process.argv[2]!);
console.log(response.statusCode);
