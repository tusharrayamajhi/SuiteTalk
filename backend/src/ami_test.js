// @ts-ignore
import AMI from 'asterisk-ami';
const ami = new AMI(5038, '172.18.113.51', 'suitetalk', 'tushar123');
console.log("Connecting to Asterisk AMI...");
ami.on('connect', () => {
    console.log("Connected to Asterisk Manager Interface!");
    ami.disconnect();
});
ami.on('error', (err) => {
    console.error("AMI Error:", err);
});
ami.on('disconnect', () => {
    console.log("Disconnected from AMI.");
});
//# sourceMappingURL=ami_test.js.map