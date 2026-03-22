const { ethers } = require('ethers');
async function test() {
    const rpc = new ethers.JsonRpcProvider("https://mainnet.base.org");
    const abi = ["function claimedAmounts(address, address) view returns (uint256)"];
    const contract = new ethers.Contract('0xA16459A0282641CeA91B67459F0bAE2B5456B15F', abi, rpc);
    const amount = await contract.claimedAmounts('0x8919379659aA469904E070bd6497746537365618', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    console.log("Claimed on-chain:", amount.toString());
}
test();
