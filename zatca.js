// ============================================
// NAQDI - ZATCA PHASE 2 MODULE (v4 — VERIFIED + BORINGSSL FIX)
// Uses zatca-xml-js library for XML, signing, hashing, QR
// Custom CSR/key generation via external OpenSSL (proven working)
// All property names verified against actual library source code
// Patches library signing to use external OpenSSL (Electron BoringSSL workaround)
// ============================================

const crypto = require('crypto');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// zatca-xml-js library (XML, signing, hashing, QR)
const { EGS, ZATCASimplifiedTaxInvoice } = require('zatca-xml-js');

// ============ BORINGSSL MONKEY-PATCH ============
// Electron uses BoringSSL which does NOT support secp256k1.
// The library's signing module uses crypto.createSign('sha256').sign(ec_key)
// which will CRASH in Electron. We patch it to use external OpenSSL.
const signingModule = require('zatca-xml-js/lib/zatca/signing');
const originalCreateDigitalSignature = signingModule.createInvoiceDigitalSignature;

signingModule.createInvoiceDigitalSignature = function(invoice_hash, private_key_string) {
  const invoice_hash_bytes = Buffer.from(invoice_hash, 'base64');

  // First try native crypto (works outside Electron / on systems with OpenSSL)
  try {
    const cleanedup = signingModule.cleanUpPrivateKeyString(private_key_string);
    const wrapped = `-----BEGIN EC PRIVATE KEY-----\n${cleanedup}\n-----END EC PRIVATE KEY-----`;
    const sign = crypto.createSign('sha256');
    sign.update(invoice_hash_bytes);
    return Buffer.from(sign.sign(wrapped)).toString('base64');
  } catch (nativeErr) {
    // BoringSSL can't handle secp256k1 — fall back to external OpenSSL
    
    const { execSync } = require('child_process');
    const os = require('os');
    const tmpDir = os.tmpdir();
    const ts = Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const hashPath = path.join(tmpDir, 'naqdi_sighash_' + ts + '.bin');
    const sigPath = path.join(tmpDir, 'naqdi_sig_' + ts + '.der');
    const keyPath = path.join(tmpDir, 'naqdi_sigkey_' + ts + '.pem');

    try {
      const openssl = findOpenSSL();

      // Write the hash bytes to sign
      fs.writeFileSync(hashPath, invoice_hash_bytes);

      // Write the EC private key
      const cleanedup = signingModule.cleanUpPrivateKeyString(private_key_string);
      const wrapped = `-----BEGIN EC PRIVATE KEY-----\n${cleanedup}\n-----END EC PRIVATE KEY-----`;
      fs.writeFileSync(keyPath, wrapped, 'utf-8');

      // Sign with OpenSSL
      execSync(`"${openssl}" dgst -sha256 -sign "${keyPath}" -out "${sigPath}" "${hashPath}"`, { stdio: 'pipe', timeout: 10000 });

      const sigDer = fs.readFileSync(sigPath);
      return sigDer.toString('base64');
    } finally {
      try { fs.unlinkSync(hashPath); } catch (e) {}
      try { fs.unlinkSync(sigPath); } catch (e) {}
      try { fs.unlinkSync(keyPath); } catch (e) {}
    }
  }
};

// ZATCA API URLs
const ZATCA_URLS = {
  sandbox: 'https://gw-fatoora.zatca.gov.sa',
  production: 'https://gw-fatoora.zatca.gov.sa',
};

const ZATCA_ENDPOINTS = {
  core: {
    complianceCSID: '/e-invoicing/core/compliance',
    complianceInvoice: '/e-invoicing/core/compliance/invoices',
    productionCSID: '/e-invoicing/core/production/csids',
    reporting: '/e-invoicing/core/invoices/reporting/single',
    clearance: '/e-invoicing/core/invoices/clearance/single',
  },
  simulation: {
    complianceCSID: '/e-invoicing/simulation/compliance',
    complianceInvoice: '/e-invoicing/simulation/compliance/invoices',
    productionCSID: '/e-invoicing/simulation/production/csids',
    reporting: '/e-invoicing/simulation/invoices/reporting/single',
    clearance: '/e-invoicing/simulation/invoices/clearance/single',
  },
  developer: {
    complianceCSID: '/e-invoicing/developer-portal/compliance',
    complianceInvoice: '/e-invoicing/developer-portal/compliance/invoices',
    productionCSID: '/e-invoicing/developer-portal/production/csids',
    reporting: '/e-invoicing/developer-portal/invoices/reporting/single',
    clearance: '/e-invoicing/developer-portal/invoices/clearance/single',
  },
};

function getEndpoints(zatcaMode) {
  if (zatcaMode === 'phase2_sandbox' || zatcaMode === 'developer') return ZATCA_ENDPOINTS.developer;
  if (zatcaMode === 'simulation') return ZATCA_ENDPOINTS.simulation;
  return ZATCA_ENDPOINTS.core;
}

// ============ KEY GENERATION (via external OpenSSL) ============
// Electron uses BoringSSL which does NOT support secp256k1.
function generateKeyPair() {
  const { execSync } = require('child_process');
  const os = require('os');
  const tmpDir = os.tmpdir();
  const ts = Date.now();
  const keyPath = path.join(tmpDir, 'naqdi_ec_privkey_' + ts + '.pem');

  try {
    const openssl = findOpenSSL();

    // Generate EC private key with secp256k1 (EC format, NOT PKCS8)
    // zatca-xml-js expects "-----BEGIN EC PRIVATE KEY-----" format
    execSync(`"${openssl}" ecparam -name secp256k1 -genkey -noout -out "${keyPath}"`, { stdio: 'pipe', timeout: 10000 });

    const ecPrivateKeyPem = fs.readFileSync(keyPath, 'utf-8').trim();

    return ecPrivateKeyPem;
  } finally {
    try { fs.unlinkSync(keyPath); } catch (e) {}
  }
}

// Find OpenSSL executable
function findOpenSSL() {
  const { execSync } = require('child_process');

  try {
    execSync('openssl version', { stdio: 'pipe', timeout: 5000 });
    return 'openssl';
  } catch (e) {}

  const gitPaths = [
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
    'C:\\Git\\usr\\bin\\openssl.exe',
    'D:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'D:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
    'D:\\Git\\usr\\bin\\openssl.exe',
    'E:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'E:\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
    'C:\\OpenSSL-Win64\\bin\\openssl.exe',
    'D:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
  ];
  for (const p of gitPaths) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error('OpenSSL not found. Please install Git for Windows (https://git-scm.com) which includes OpenSSL, or install OpenSSL separately.');
}

// ============ CSR GENERATION (verified working against ZATCA sandbox 2026-03-20) ============
function generateCSR(ecPrivateKeyPem, csrData, zatcaMode) {
  const { execSync } = require('child_process');
  const os = require('os');
  const tmpDir = os.tmpdir();
  const ts = Date.now();
  const keyPath = path.join(tmpDir, 'naqdi_ec_key_' + ts + '.pem');
  const csrPath = path.join(tmpDir, 'naqdi_csr_' + ts + '.pem');
  const confPath = path.join(tmpDir, 'naqdi_csr_' + ts + '.cnf');

  try {
    fs.writeFileSync(keyPath, ecPrivateKeyPem, 'utf-8');
    const openssl = findOpenSSL();

    // ZATCA requires different template names per environment:
    // Production: ZATCA-Code-Signing
    // Simulation: PREZATCA-Code-Signing
    // Developer portal (sandbox): TSTZATCA-Code-Signing
    let templateName = 'ZATCA-Code-Signing';
    if (zatcaMode === 'simulation') {
      templateName = 'PREZATCA-Code-Signing';
    } else if (zatcaMode === 'phase2_sandbox' || zatcaMode === 'developer') {
      templateName = 'TSTZATCA-Code-Signing';
    }
    const cn = csrData.commonName || 'Naqdi-POS-1';
    const orgName = csrData.organizationName || 'Merchant';
    const orgUnit = csrData.organizationUnit || 'Branch';
    const vatNumber = csrData.vatNumber || '300000000000003';
    const serialNumber = csrData.serialNumber || '1-Naqdi|2-2.5.0|3-00000001';
    const invoiceType = csrData.invoiceType || '1100';
    const location = csrData.location || 'Riyadh';
    const industry = csrData.industry || 'Retail';

    // NO basicConstraints, NO keyUsage — ZATCA rejects CSRs with these
    const conf = `oid_section = OIDs
[OIDs]
certificateTemplateName = 1.3.6.1.4.1.311.20.2
[req]
default_bits = 2048
req_extensions = v3_req
prompt = no
default_md = sha256
distinguished_name = dn
[dn]
C=SA
OU=${orgUnit}
O=${orgName}
CN=${cn}
[v3_req]
certificateTemplateName = ASN1:PRINTABLESTRING:${templateName}
subjectAltName = dirName:alt_names
[alt_names]
SN=${serialNumber}
UID=${vatNumber}
title=${invoiceType}
registeredAddress=${location}
businessCategory=${industry}
`;

    fs.writeFileSync(confPath, conf, 'utf-8');
    const cmd = `"${openssl}" req -new -sha256 -key "${keyPath}" -config "${confPath}" -out "${csrPath}"`;
    execSync(cmd, { stdio: 'pipe', timeout: 10000 });

    const csrPem = fs.readFileSync(csrPath, 'utf-8').trim();
    const csrBase64 = Buffer.from(csrPem).toString('base64');

    return csrBase64;
  } finally {
    try { fs.unlinkSync(keyPath); } catch (e) {}
    try { fs.unlinkSync(csrPath); } catch (e) {}
    try { fs.unlinkSync(confPath); } catch (e) {}
  }
}

// ============ HTTPS REQUEST HELPER ============
function zatcaRequest(baseUrl, endpoint, method, headers, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, baseUrl);
    const bodyStr = body ? JSON.stringify(body) : '';
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Language': 'en',
        'Accept-Version': 'V2',
        ...headers,
      },
    };

    if (bodyStr) {
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr, 'utf8');
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: data, raw: true });
        }
      });
    });

    req.on('error', (e) => reject(new Error('ZATCA API error: ' + e.message)));
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('ZATCA API timeout (15s)')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ============ CREATE EGS UNIT INFO ============
// Returns the EGSUnitInfo object used by zatca-xml-js
function createEGSUnitInfo(biz, vatNumber) {
  return {
    uuid: uuidv4(),
    custom_id: 'EGS1-' + (vatNumber || '').substring(0, 10),
    model: 'Naqdi-POS',
    CRN_number: biz.crNumber || '0000000000',
    VAT_name: biz.nameAr || biz.nameEn || 'Merchant',
    VAT_number: vatNumber || '',
    location: {
      city: biz.city || 'Riyadh',
      city_subdivision: biz.district || 'Main',
      street: biz.street || biz.address || 'Main Street',
      plot_identification: biz.buildingNumber || '0000',
      building: biz.buildingNumber || '0000',
      postal_zone: biz.postalCode || '00000',
    },
    branch_name: biz.branchName || 'Main Branch',
    branch_industry: biz.industry || 'Retail',
  };
}

// ============ ONBOARDING ============
async function onboardEGS(store, otp) {
  const settings = store.getAll();
  const biz = settings.business || {};
  const vatNumber = biz.vatNumber || '';
  const zatcaMode = settings.zatcaMode || 'phase2_sandbox';
  const isSandbox = zatcaMode === 'phase2_sandbox' || zatcaMode === 'developer';
  const baseUrl = isSandbox ? ZATCA_URLS.sandbox : ZATCA_URLS.production;
  const endpoints = getEndpoints(zatcaMode);


  if (!vatNumber || vatNumber.length !== 15 || !vatNumber.startsWith('3') || !vatNumber.endsWith('3')) {
    throw new Error('Invalid VAT number. Must be 15 digits starting and ending with 3.');
  }

  // Step 1: Generate EC private key via external OpenSSL
  const ecPrivateKeyPem = generateKeyPair();

  // Step 2: Generate CSR
  const csrData = {
    commonName: 'Naqdi-POS-' + (Date.now() % 10000),
    organizationName: biz.nameEn || biz.nameAr || 'Merchant',
    organizationUnit: biz.branchName || 'Main Branch',
    vatNumber: vatNumber,
    serialNumber: '1-Naqdi|2-2.5.0|3-' + uuidv4().substring(0, 8),
    invoiceType: '1100',
    location: biz.address || 'Riyadh',
    industry: 'Retail',
  };
  const csrBase64 = generateCSR(ecPrivateKeyPem, csrData, zatcaMode);

  // Step 3: Request Compliance CSID
  const complianceRes = await zatcaRequest(baseUrl, endpoints.complianceCSID, 'POST', {
    'OTP': otp,
  }, {
    csr: csrBase64,
  });

  if (complianceRes.statusCode !== 200 || !complianceRes.data.binarySecurityToken) {
    console.error('[ZATCA] Compliance CSID failed:', complianceRes.data);
    throw new Error('Compliance CSID failed: ' + JSON.stringify(complianceRes.data.errors || complianceRes.data));
  }

  const complianceToken = complianceRes.data.binarySecurityToken;
  const complianceSecret = complianceRes.data.secret;
  const complianceRequestId = complianceRes.data.requestID;
  // Decode binary security token to get the actual certificate PEM
  const complianceCertPem = Buffer.from(complianceToken, 'base64').toString('utf-8');


  // Step 4: Run compliance checks using zatca-xml-js

  // Create EGS unit info with keys injected
  const egsunitInfo = createEGSUnitInfo(biz, vatNumber);
  const egs = new EGS(egsunitInfo);

  // VERIFIED: egs.set() merges into the private egs_info object
  egs.set({
    private_key: ecPrivateKeyPem,
    csr: csrBase64,
    compliance_certificate: complianceCertPem,
    compliance_api_secret: complianceSecret,
  });

  let prevHash = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

  // Test 3 invoice types: regular, credit note, debit note
  const testTypes = [
    { cancelation: null, name: 'Simplified Tax Invoice' },
    { cancelation: { cancelation_type: '381', canceled_invoice_number: 1, payment_method: '10', reason: 'Test credit note' }, name: 'Simplified Credit Note' },
    { cancelation: { cancelation_type: '383', canceled_invoice_number: 1, payment_method: '10', reason: 'Test debit note' }, name: 'Simplified Debit Note' },
  ];

  // Get the egs_info with keys for passing to invoice constructor
  const egsInfoWithKeys = egs.get();

  for (const tt of testTypes) {

    const invoiceProps = {
      egs_info: egsInfoWithKeys,
      invoice_counter_number: 1,
      invoice_serial_number: 'SME00' + Math.floor(Math.random() * 999),
      issue_date: new Date().toISOString().split('T')[0],
      issue_time: new Date().toISOString().split('T')[1].substring(0, 8),
      previous_invoice_hash: prevHash,
      line_items: [{
        id: '1',
        name: 'Test Item',
        quantity: 5,
        tax_exclusive_price: 10,
        VAT_percent: 0.15,
        other_taxes: [],
        discounts: [],
      }],
    };

    // Add cancelation for credit/debit notes
    if (tt.cancelation) {
      invoiceProps.cancelation = tt.cancelation;
    }

    // VERIFIED: Must create ZATCASimplifiedTaxInvoice class instance
    const invoice = new ZATCASimplifiedTaxInvoice({ props: invoiceProps });

    // VERIFIED: signInvoice takes (ZATCASimplifiedTaxInvoice, production_boolean)
    // false = use compliance_certificate for signing
    const { signed_invoice_string, invoice_hash, qr } = egs.signInvoice(invoice, false);

    // Submit for compliance check via direct API
    const authHeader = 'Basic ' + Buffer.from(complianceToken + ':' + complianceSecret).toString('base64');
    const signedXmlBase64 = Buffer.from(signed_invoice_string).toString('base64');

    const checkRes = await zatcaRequest(baseUrl, endpoints.complianceInvoice, 'POST', {
      'Authorization': authHeader,
    }, {
      invoiceHash: invoice_hash,
      uuid: egsInfoWithKeys.uuid,
      invoice: signedXmlBase64,
    });

    if (checkRes.statusCode !== 200 && checkRes.statusCode !== 202) {
      console.error('[ZATCA] Compliance check failed for', tt.name, ':', JSON.stringify(checkRes.data));
      throw new Error('Compliance check failed for ' + tt.name + ': ' + JSON.stringify(checkRes.data));
    }

    prevHash = invoice_hash;
  }

  // Step 5: Request Production CSID
  const authHeader = 'Basic ' + Buffer.from(complianceToken + ':' + complianceSecret).toString('base64');
  const productionRes = await zatcaRequest(baseUrl, endpoints.productionCSID, 'POST', {
    'Authorization': authHeader,
  }, {
    compliance_request_id: complianceRequestId,
  });

  if (productionRes.statusCode !== 200 || !productionRes.data.binarySecurityToken) {
    console.error('[ZATCA] Production CSID failed:', productionRes.data);
    throw new Error('Production CSID failed: ' + JSON.stringify(productionRes.data));
  }

  const productionToken = productionRes.data.binarySecurityToken;
  const productionSecret = productionRes.data.secret;
  const productionCertPem = Buffer.from(productionToken, 'base64').toString('utf-8');


  // Store credentials
  const zatcaCredentials = {
    ecPrivateKeyPem: ecPrivateKeyPem,
    // Production credentials (for real reporting)
    productionToken: productionToken,
    productionSecret: productionSecret,
    productionCertPem: productionCertPem,
    // Compliance credentials (needed for sandbox reporting — sandbox production cert is fake)
    complianceToken: complianceToken,
    complianceSecret: complianceSecret,
    complianceCertPem: complianceCertPem,
    complianceRequestId: complianceRequestId,
    egsunitInfo: egsunitInfo,
    onboardedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    lastInvoiceHash: prevHash,
    invoiceCounter: 0,
    status: 'active',
  };

  store.set('zatcaCredentials', zatcaCredentials);

  return {
    success: true,
    onboardedAt: zatcaCredentials.onboardedAt,
    expiresAt: zatcaCredentials.expiresAt,
  };
}

// ============ CREATE SIGNING EGS FROM STORED CREDENTIALS ============
function createSigningEGS(store) {
  const creds = store.get('zatcaCredentials');
  if (!creds || creds.status !== 'active') {
    throw new Error('ZATCA not onboarded. Please complete onboarding first.');
  }

  const settings = store.getAll();
  const biz = settings.business || {};
  const zatcaMode = settings.zatcaMode || 'phase2_sandbox';
  const isSandbox = zatcaMode === 'phase2_sandbox' || zatcaMode === 'developer';

  const egsunitInfo = creds.egsunitInfo || createEGSUnitInfo(biz, biz.vatNumber || '');
  const egs = new EGS(egsunitInfo);

  // Sandbox/developer/simulation: use compliance certificate (sandbox production cert is fake)
  // Production: use production certificate
  if (isSandbox) {
    egs.set({
      private_key: creds.ecPrivateKeyPem,
      compliance_certificate: creds.complianceCertPem,
      compliance_api_secret: creds.complianceSecret,
    });
  } else {
    egs.set({
      private_key: creds.ecPrivateKeyPem,
      production_certificate: creds.productionCertPem,
      production_api_secret: creds.productionSecret,
    });
  }

  return { egs, creds, isSandbox, zatcaMode, egsunitInfo: egs.get() };
}

// ============ BUILD AND SIGN INVOICE ============
// Creates a ZATCASimplifiedTaxInvoice and signs it
function buildAndSignInvoice(egs, egsunitInfo, invoiceData, creds, cancelation, useProductionCert) {
  const counter = (creds.invoiceCounter || 0) + 1;
  const now = new Date();

  // Convert line items to zatca-xml-js format
  const lineItems = (invoiceData.lineItems || []).map((item, idx) => {
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unitPrice) || 0;
    const taxRate = Number(item.taxRate) || 15;
    const discountAmt = Number(item.discountAmount) || 0;

    const li = {
      id: String(idx + 1),
      name: item.name || 'Item',
      quantity: qty,
      tax_exclusive_price: price,
      VAT_percent: taxRate / 100, // Library expects 0.15 not 15
      other_taxes: [],
      discounts: [],
    };

    if (discountAmt > 0) {
      li.discounts.push({ amount: discountAmt, reason: item.discountReason || 'Discount' });
    }

    return li;
  });

  if (lineItems.length === 0) {
    lineItems.push({
      id: '1',
      name: 'Item',
      quantity: 1,
      tax_exclusive_price: Number(invoiceData.subtotal) || 0,
      VAT_percent: 0.15,
      other_taxes: [],
      discounts: [],
    });
  }

  // Build invoice props — VERIFIED against ZATCASimplifiedInvoiceProps interface
  // IMPORTANT: Each invoice must have a unique UUID per ZATCA requirements
  const invoiceUUID = uuidv4();
  const egsInfoForInvoice = { ...egsunitInfo, uuid: invoiceUUID };

  const invoiceProps = {
    egs_info: egsInfoForInvoice,
    invoice_counter_number: counter,
    invoice_serial_number: String(invoiceData.invoiceNumber || 'INV-' + counter),
    issue_date: invoiceData.issueDate || now.toISOString().split('T')[0],
    issue_time: invoiceData.issueTime || now.toISOString().split('T')[1].substring(0, 8),
    previous_invoice_hash: creds.lastInvoiceHash || 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==',
    line_items: lineItems,
  };

  // Add cancelation for credit/debit notes
  if (cancelation) {
    invoiceProps.cancelation = cancelation;
  }

  // VERIFIED: Must create class instance, NOT plain object
  const invoice = new ZATCASimplifiedTaxInvoice({ props: invoiceProps });

  // VERIFIED: signInvoice(invoice, true) = production cert, signInvoice(invoice, false) = compliance cert
  const { signed_invoice_string, invoice_hash, qr } = egs.signInvoice(invoice, useProductionCert);

  return {
    signed_invoice_string,
    invoice_hash,
    qr,
    uuid: invoiceUUID,
    counter,
  };
}

// ============ REPORT INVOICE (B2C — Simplified) ============
async function reportInvoice(store, invoiceData) {
  const { egs, creds, isSandbox, zatcaMode, egsunitInfo } = createSigningEGS(store);
  const baseUrl = isSandbox ? ZATCA_URLS.sandbox : ZATCA_URLS.production;
  const endpoints = getEndpoints(zatcaMode);

  // Determine if this is a credit/debit note
  let cancelation = null;
  if (invoiceData.typeCode === 381 || invoiceData.typeCode === '381') {
    cancelation = {
      cancelation_type: '381',
      canceled_invoice_number: invoiceData.canceledInvoiceNumber || 1,
      payment_method: invoiceData.paymentMethod || '10',
      reason: invoiceData.cancelReason || 'Return',
    };
  } else if (invoiceData.typeCode === 383 || invoiceData.typeCode === '383') {
    cancelation = {
      cancelation_type: '383',
      canceled_invoice_number: invoiceData.canceledInvoiceNumber || 1,
      payment_method: invoiceData.paymentMethod || '10',
      reason: invoiceData.cancelReason || 'Adjustment',
    };
  }

  const result = buildAndSignInvoice(egs, egsunitInfo, invoiceData, creds, cancelation, !isSandbox);

  // Sandbox: sign with compliance cert, report to compliance endpoint
  // Production: sign with production cert, report to production endpoint
  const useCompliance = isSandbox;
  const token = useCompliance ? creds.complianceToken : creds.productionToken;
  const secret = useCompliance ? creds.complianceSecret : creds.productionSecret;
  const endpoint = useCompliance ? endpoints.complianceInvoice : endpoints.reporting;

  const authHeader = 'Basic ' + Buffer.from(token + ':' + secret).toString('base64');
  const signedXmlBase64 = Buffer.from(result.signed_invoice_string).toString('base64');


  const reportRes = await zatcaRequest(baseUrl, endpoint, 'POST', {
    'Authorization': authHeader,
    'Clearance-Status': '0',
  }, {
    invoiceHash: result.invoice_hash,
    uuid: result.uuid,
    invoice: signedXmlBase64,
  });

  const isSuccess = reportRes.statusCode === 200 || reportRes.statusCode === 202;

  // Detailed logging
  if (reportRes.data) {
    if (reportRes.data.validationResults) {
      const vr = reportRes.data.validationResults;
      if (vr.errorMessages && vr.errorMessages.length > 0) {
      }
      if (vr.warningMessages && vr.warningMessages.length > 0) {
      }
    }
    if (reportRes.data.errorMessages) {
    }
    if (reportRes.data.errors) {
    }
  }

  // ZATCA guidelines Section 4.3: "The PDH must be maintained even in the case of documents
  // which were rejected by ZATCA's FATOORA platform as the platform does record the document
  // hash of rejected submissions." Counter must also always increment per FAQ.
  creds.invoiceCounter = result.counter;
  creds.lastInvoiceHash = result.invoice_hash;
  store.set('zatcaCredentials', creds);

  return {
    success: isSuccess,
    statusCode: reportRes.statusCode,
    data: reportRes.data,
    invoiceHash: result.invoice_hash,
    invoiceCounter: result.counter,
    uuid: result.uuid,
    qrCode: result.qr,
    signedXml: result.signed_invoice_string,
  };
}

// ============ CLEAR INVOICE (B2B — Standard) ============
async function clearInvoice(store, invoiceData) {
  const { egs, creds, isSandbox, zatcaMode, egsunitInfo } = createSigningEGS(store);
  const baseUrl = isSandbox ? ZATCA_URLS.sandbox : ZATCA_URLS.production;
  const endpoints = getEndpoints(zatcaMode);

  let cancelation = null;
  if (invoiceData.typeCode === 381 || invoiceData.typeCode === '381') {
    cancelation = { cancelation_type: '381', canceled_invoice_number: invoiceData.canceledInvoiceNumber || 1, payment_method: invoiceData.paymentMethod || '10', reason: invoiceData.cancelReason || 'Return' };
  } else if (invoiceData.typeCode === 383 || invoiceData.typeCode === '383') {
    cancelation = { cancelation_type: '383', canceled_invoice_number: invoiceData.canceledInvoiceNumber || 1, payment_method: invoiceData.paymentMethod || '10', reason: invoiceData.cancelReason || 'Adjustment' };
  }

  const result = buildAndSignInvoice(egs, egsunitInfo, invoiceData, creds, cancelation, !isSandbox);

  const authHeader = 'Basic ' + Buffer.from(creds.productionToken + ':' + creds.productionSecret).toString('base64');
  const signedXmlBase64 = Buffer.from(result.signed_invoice_string).toString('base64');

  const clearRes = await zatcaRequest(baseUrl, endpoints.clearance, 'POST', {
    'Authorization': authHeader,
    'Clearance-Status': '1',
  }, {
    invoiceHash: result.invoice_hash,
    uuid: result.uuid,
    invoice: signedXmlBase64,
  });

  const isSuccess = clearRes.statusCode === 200 || clearRes.statusCode === 202;

  // ZATCA guidelines: hash and counter must always be updated, even for rejected documents.
  // "The PDH must be maintained even in the case of documents which were rejected"
  creds.invoiceCounter = result.counter;
  creds.lastInvoiceHash = result.invoice_hash;
  store.set('zatcaCredentials', creds);

  return {
    success: isSuccess,
    statusCode: clearRes.statusCode,
    data: clearRes.data,
    invoiceHash: result.invoice_hash,
    uuid: result.uuid,
    qrCode: result.qr,
    signedXml: result.signed_invoice_string,
  };
}

// ============ GET STATUS ============
function getZatcaStatus(store) {
  const creds = store.get('zatcaCredentials');
  if (!creds) {
    return { status: 'not_onboarded', message: 'ZATCA Phase 2 not configured' };
  }

  const now = new Date();
  const expiry = new Date(creds.expiresAt);
  const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 0) {
    return { status: 'expired', message: 'CSID expired. Please renew.', expiresAt: creds.expiresAt, daysLeft: 0 };
  }

  if (daysLeft <= 30) {
    return { status: 'expiring_soon', message: `CSID expires in ${daysLeft} days`, expiresAt: creds.expiresAt, daysLeft };
  }

  return {
    status: 'active',
    message: 'Connected and active',
    onboardedAt: creds.onboardedAt,
    expiresAt: creds.expiresAt,
    daysLeft: daysLeft,
    invoiceCounter: creds.invoiceCounter || 0,
  };
}

// ============ PHASE 1 QR CODE (backward compatible for receipt display) ============
function generatePhase1QR(data) {
  function tlv(tag, value) {
    const buf = Buffer.from(String(value || ''), 'utf8');
    return Buffer.concat([Buffer.from([tag, buf.length]), buf]);
  }

  return Buffer.concat([
    tlv(1, data.sellerName),
    tlv(2, data.vatNumber),
    tlv(3, data.timestamp),
    tlv(4, data.total),
    tlv(5, data.vatAmount),
  ]).toString('base64');
}

// ============ PHASE 2 QR CODE (backward compatible — library generates this during signInvoice) ============
function generatePhase2QR(data) {
  function tlv(tag, value) {
    const buf = Buffer.from(String(value || ''), 'utf8');
    return Buffer.concat([Buffer.from([tag, buf.length]), buf]);
  }
  function tlvBin(tag, value) {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value || '', 'base64');
    return Buffer.concat([Buffer.from([tag, buf.length]), buf]);
  }

  const parts = [
    tlv(1, data.sellerName),
    tlv(2, data.vatNumber),
    tlv(3, data.timestamp),
    tlv(4, data.total),
    tlv(5, data.vatAmount),
    tlvBin(6, Buffer.from(data.invoiceHash || '', 'base64')),
    tlvBin(7, Buffer.from(data.signature || '', 'base64')),
    tlvBin(8, Buffer.from(data.publicKey || '', 'base64')),
  ];

  if (data.zatcaStamp) {
    parts.push(tlvBin(9, Buffer.from(data.zatcaStamp, 'base64')));
  }

  return Buffer.concat(parts).toString('base64');
}

// ============ EXPORTS ============
module.exports = {
  onboardEGS,
  reportInvoice,
  clearInvoice,
  getZatcaStatus,
  generatePhase1QR,
  generatePhase2QR,
};
