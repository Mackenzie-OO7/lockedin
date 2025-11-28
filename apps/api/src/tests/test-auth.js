#!/usr/bin/env node

import { Keypair } from '@stellar/stellar-sdk';

// Generate a test keypair
const keypair = Keypair.random();
const walletAddress = keypair.publicKey();
const secretKey = keypair.secret();

// Create challenge message
const timestamp = Date.now();
const message = `Sign in to LockedIn\nWallet: ${walletAddress}\nTimestamp: ${timestamp}`;

// Sign the message
const messageBuffer = Buffer.from(message, 'utf8');
const signature = keypair.sign(messageBuffer).toString('hex');

// Output test data
console.log('Test Wallet Address:', walletAddress);
console.log('Secret Key (for reference):', secretKey);
console.log('\nTest Request Body:');
console.log(JSON.stringify({
  walletAddress,
  message,
  signature
}, null, 2));

// Make the API call
const testAuth = async () => {
  try {
    const response = await fetch('http://localhost:3001/api/auth/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        walletAddress,
        message,
        signature
      })
    });

    const data = await response.json();
    console.log('\nAPI Response:');
    console.log(JSON.stringify(data, null, 2));

    if (data.success && data.token) {
      console.log('\n✅ Authentication successful!');
      console.log('JWT Token:', data.token);
      console.log('\nUse this token in subsequent requests:');
      console.log('Authorization: Bearer', data.token);

      // Save for other tests
      process.env.TEST_TOKEN = data.token;
      process.env.TEST_WALLET = walletAddress;
    } else {
      console.log('\n❌ Authentication failed');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
};

testAuth();
