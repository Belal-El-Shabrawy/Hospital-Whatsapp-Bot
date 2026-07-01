// خريطة مرادفات: الاسم العلمي (اللي الـ AI ممكن يفكر فيه) -> الاسم التجاري (اللي متسجل في الداتابيز)
const MEDICINE_SYNONYMS = {
    ibuprofen: "brufen",
    paracetamol: "panadol",
    acetaminophen: "panadol",
    amoxicillin: "augmentin",
    diclofenac: "voltaren",
    esomeprazole: "nexium",
    pantoprazole: "controloc",
    loratadine: "claritine",
    xylometazoline: "otrivin",
    loperamide: "antinal",
    nifuroxazide: "antinal"
};

// خريطة مباشرة: الاسم بالعربي (زي ما المريض بيكتبه فعلاً) -> مفتاح الدواء في الداتابيز
// دي أهم خطوة: بتمنع الـ AI من الاضطرار لتخمين تهجية إنجليزية غلط لاسم عربي
const ARABIC_MEDICINE_MAP = {
    "بانادول": "panadol",
    "كونجستال": "congestal",
    "بروفين": "brufen",
    "أوجمنتين": "augmentin", "اوجمنتين": "augmentin",
    "كتافلام": "cataflam", "كاتافلام": "cataflam",
    "كومتركس": "comtrex",
    "أوتريفين": "otrivin", "اوتريفين": "otrivin",
    "كونكور": "concor",
    "كونترولوك": "controloc",
    "الفينترن": "alphintern", "ألفينترن": "alphintern",
    "أنتينال": "antinal", "انتينال": "antinal",
    "نيكسيوم": "nexium",
    "كيتوفان": "ketofan",
    "كلاريتين": "claritine",
    "فولتارين": "voltaren"
};

module.exports = { MEDICINE_SYNONYMS, ARABIC_MEDICINE_MAP };
