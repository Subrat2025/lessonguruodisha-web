import com.android.aapt.ConfigurationOuterClass.Configuration;
import com.android.aapt.Resources.CompoundValue;
import com.android.aapt.Resources.ConfigValue;
import com.android.aapt.Resources.Entry;
import com.android.aapt.Resources.EntryId;
import com.android.aapt.Resources.FileReference;
import com.android.aapt.Resources.Item;
import com.android.aapt.Resources.PackageId;
import com.android.aapt.Resources.Primitive;
import com.android.aapt.Resources.Reference;
import com.android.aapt.Resources.ResourceTable;
import com.android.aapt.Resources.Style;
import com.android.aapt.Resources.Type;
import com.android.aapt.Resources.TypeId;
import com.android.aapt.Resources.Value;
import com.android.aapt.Resources.XmlAttribute;
import com.android.aapt.Resources.XmlElement;
import com.android.aapt.Resources.XmlNamespace;
import com.android.aapt.Resources.XmlNode;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Emits the protobuf (aapt2 "proto") form of the app resources for the AAB base module,
 * from the spec.json written by res_build.py.
 *
 * Usage: java -cp bundletool.jar:. ProtoGen spec.json outModuleDir
 */
public class ProtoGen {
    static JsonObject attrIds;
    static String androidNs;

    public static void main(String[] args) throws IOException {
        JsonObject spec = new Gson().fromJson(new FileReader(args[0]), JsonObject.class);
        Path out = Paths.get(args[1]);
        attrIds = spec.getAsJsonObject("attrIds");
        androidNs = spec.get("androidNs").getAsString();

        write(out.resolve("manifest/AndroidManifest.xml"), xml(spec.getAsJsonObject("manifest"), true).toByteArray());
        byte[] adaptive = xml(spec.getAsJsonObject("adaptiveIcon"), true).toByteArray();

        com.android.aapt.Resources.Package.Builder pkg = com.android.aapt.Resources.Package.newBuilder()
                .setPackageId(PackageId.newBuilder().setId(spec.get("pkgId").getAsInt()))
                .setPackageName(spec.get("package").getAsString());

        // color
        Type.Builder color = Type.newBuilder().setTypeId(TypeId.newBuilder().setId(1)).setName("color");
        for (JsonElement e : spec.getAsJsonArray("colors")) {
            JsonObject c = e.getAsJsonObject();
            color.addEntry(entry(c).addConfigValue(ConfigValue.newBuilder()
                    .setConfig(Configuration.getDefaultInstance())
                    .setValue(Value.newBuilder().setItem(Item.newBuilder().setPrim(
                            Primitive.newBuilder().setColorArgb8Value((int) c.get("argb").getAsLong()))))));
        }
        pkg.addType(color);

        // mipmap
        Type.Builder mipmap = Type.newBuilder().setTypeId(TypeId.newBuilder().setId(2)).setName("mipmap");
        for (JsonElement e : spec.getAsJsonArray("mipmaps")) {
            JsonObject m = e.getAsJsonObject();
            Entry.Builder en = entry(m);
            for (JsonElement f : m.getAsJsonArray("files")) {
                JsonObject fo = f.getAsJsonObject();
                String path = fo.get("path").getAsString();
                boolean isXml = path.endsWith(".xml");
                if (isXml) write(out.resolve(path), adaptive);
                en.addConfigValue(ConfigValue.newBuilder()
                        .setConfig(Configuration.newBuilder()
                                .setDensity(fo.get("density").getAsInt())
                                .setSdkVersion(fo.get("sdk").getAsInt()))
                        .setValue(Value.newBuilder().setItem(Item.newBuilder().setFile(FileReference.newBuilder()
                                .setPath(path)
                                .setType(isXml ? FileReference.Type.PROTO_XML : FileReference.Type.PNG)))));
            }
            mipmap.addEntry(en);
        }
        pkg.addType(mipmap);

        // style
        Type.Builder style = Type.newBuilder().setTypeId(TypeId.newBuilder().setId(3)).setName("style");
        for (JsonElement e : spec.getAsJsonArray("styles")) {
            JsonObject s = e.getAsJsonObject();
            Style.Builder sb = Style.newBuilder().setParent(Reference.newBuilder()
                    .setId(s.get("parent").getAsInt()).setName("android:style/Theme.Material.Light.NoActionBar"));
            for (JsonElement ie : s.getAsJsonArray("items")) {
                JsonObject it = ie.getAsJsonObject();
                Item.Builder item = Item.newBuilder();
                if (it.get("kind").getAsString().equals("color")) {
                    item.setPrim(Primitive.newBuilder().setColorArgb8Value((int) it.get("value").getAsLong()));
                } else {
                    item.setRef(Reference.newBuilder().setId((int) it.get("value").getAsLong()));
                }
                sb.addEntry(Style.Entry.newBuilder()
                        .setKey(Reference.newBuilder().setId(it.get("attrId").getAsInt())
                                .setName("android:attr/" + it.get("attr").getAsString()))
                        .setItem(item));
            }
            style.addEntry(entry(s).addConfigValue(ConfigValue.newBuilder()
                    .setConfig(Configuration.getDefaultInstance())
                    .setValue(Value.newBuilder().setCompoundValue(CompoundValue.newBuilder().setStyle(sb)))));
        }
        pkg.addType(style);

        write(out.resolve("resources.pb"), ResourceTable.newBuilder().addPackage(pkg).build().toByteArray());
        System.out.println("proto resources -> " + out);
    }

    static Entry.Builder entry(JsonObject o) {
        int id = o.get("id").getAsInt();
        return Entry.newBuilder().setEntryId(EntryId.newBuilder().setId(id & 0xFFFF)).setName(o.get("name").getAsString());
    }

    static XmlNode xml(JsonObject n, boolean root) {
        XmlElement.Builder el = XmlElement.newBuilder().setName(n.get("tag").getAsString());
        if (root) el.addNamespaceDeclaration(XmlNamespace.newBuilder().setPrefix("android").setUri(androidNs));
        for (JsonElement ae : n.getAsJsonArray("attrs")) {
            JsonArray a = ae.getAsJsonArray();
            String name = a.get(0).getAsString(), kind = a.get(1).getAsString();
            XmlAttribute.Builder xa = XmlAttribute.newBuilder().setName(name);
            if (attrIds.has(name)) {
                xa.setNamespaceUri(androidNs).setResourceId(attrIds.get(name).getAsInt());
            }
            switch (kind) {
                case "str":
                    xa.setValue(a.get(2).getAsString());
                    break;
                case "int":
                    xa.setValue(a.get(2).getAsString()).setCompiledItem(Item.newBuilder().setPrim(
                            Primitive.newBuilder().setIntDecimalValue(a.get(2).getAsInt())));
                    break;
                case "hex":
                    xa.setValue("0x" + Integer.toHexString(a.get(2).getAsInt())).setCompiledItem(Item.newBuilder().setPrim(
                            Primitive.newBuilder().setIntHexadecimalValue(a.get(2).getAsInt())));
                    break;
                case "bool":
                    boolean b = a.get(2).getAsBoolean();
                    xa.setValue(Boolean.toString(b)).setCompiledItem(Item.newBuilder().setPrim(
                            Primitive.newBuilder().setBooleanValue(b)));
                    break;
                case "ref":
                    int id = (int) a.get(2).getAsLong();
                    xa.setValue(String.format("@0x%08x", id)).setCompiledItem(Item.newBuilder().setRef(
                            Reference.newBuilder().setId(id)));
                    break;
                default:
                    throw new IllegalArgumentException(kind);
            }
            el.addAttribute(xa);
        }
        for (JsonElement c : n.getAsJsonArray("children")) el.addChild(xml(c.getAsJsonObject(), false));
        return XmlNode.newBuilder().setElement(el).build();
    }

    static void write(Path p, byte[] data) throws IOException {
        Files.createDirectories(p.getParent());
        try (FileOutputStream fo = new FileOutputStream(p.toFile())) {
            fo.write(data);
        }
    }
}
