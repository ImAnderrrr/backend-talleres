function verifyEmailDeliverability(email) {
  // Simplified policy: only enforce institutional domain
  const ok = /@miumg\.edu\.gt$/i.test(String(email || '').trim());
  if (!ok) {
    const err = new Error('Debes utilizar un correo institucional @miumg.edu.gt.');
    throw err;
  }
  return { status: 'valid', policy: 'domain-only' };
}

module.exports = { verifyEmailDeliverability };
