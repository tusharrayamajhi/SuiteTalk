// @ts-ignore
import net from 'net'

const client = new net.Socket()
console.log("Attempting to connect to 172.18.113.51:5038...")

client.connect(5038, '172.18.113.51', () => {
  console.log('Connected!')
  client.destroy()
})

client.on('error', (err: any) => {
  console.error('Connection failed:', err.message)
})
