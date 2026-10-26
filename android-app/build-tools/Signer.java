import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;

import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

/**
 * Signs (v1+v2+v3) and verifies an APK with apksig (bundled in bundletool).
 * Usage: java -cp bundletool.jar:. Signer in.apk out.apk keystore.p12 alias storepass minSdk
 */
public class Signer {
    public static void main(String[] a) throws Exception {
        File in = new File(a[0]), out = new File(a[1]);
        char[] pass = a[4].toCharArray();
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream fi = new FileInputStream(a[2])) {
            ks.load(fi, pass);
        }
        PrivateKey key = (PrivateKey) ks.getKey(a[3], pass);
        X509Certificate cert = (X509Certificate) ks.getCertificate(a[3]);
        ApkSigner.SignerConfig sc = new ApkSigner.SignerConfig.Builder("LGO", key, Collections.singletonList(cert)).build();
        new ApkSigner.Builder(Collections.singletonList(sc))
                .setInputApk(in).setOutputApk(out)
                .setMinSdkVersion(Integer.parseInt(a[5]))
                .setV1SigningEnabled(true).setV2SigningEnabled(true).setV3SigningEnabled(true)
                .build().sign();
        ApkVerifier.Result r = new ApkVerifier.Builder(out).build().verify();
        System.out.println("verified=" + r.isVerified() + " v1=" + r.isVerifiedUsingV1Scheme()
                + " v2=" + r.isVerifiedUsingV2Scheme() + " v3=" + r.isVerifiedUsingV3Scheme());
        for (ApkVerifier.IssueWithParams e : r.getErrors()) System.out.println("ERROR " + e);
        if (!r.isVerified()) System.exit(1);
    }
}
