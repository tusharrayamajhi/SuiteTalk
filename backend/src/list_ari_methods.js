// @ts-ignore
import ari from 'ari-client';
async function main() {
    try {
        const client = await ari.connect('http://127.0.0.1:8088', 'suitetalk', 'tushar123');
        console.log("--- client.channels Keys ---");
        console.log(Object.keys(client.channels).filter(k => typeof client.channels[k] === 'function'));
        console.log("--- client.Channel Prototype Methods ---");
        if (client.Channel) {
            console.log(Object.getOwnPropertyNames(client.Channel.prototype).filter(k => typeof client.Channel.prototype[k] === 'function'));
        }
        else {
            console.log("client.Channel not found");
        }
        process.exit(0);
    }
    catch (err) {
        console.error("Diagnostic error:", err);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=list_ari_methods.js.map