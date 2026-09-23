// DDC (Dewey Decimal Classification) main classes and divisions.
// Major class codes are the hundreds digit (e.g. "500"); division codes go to the tens digit (e.g. "510").

export interface DdcDivision {
    code: string; // e.g. "510"
    label: string;
}

export interface DdcClass {
    code: string; // e.g. "500"
    label: string;
    shortLabel: string;
    divisions: DdcDivision[];
}

export const DDC_CLASSES: DdcClass[] = [
    {
        code: '000', label: 'Computer Science, Information & General Works', shortLabel: 'Computing & General',
        divisions: [
            { code: '000', label: 'Knowledge & Computer Science (General)' },
            { code: '010', label: 'Bibliography' },
            { code: '020', label: 'Library & Information Science' },
            { code: '030', label: 'Encyclopedias' },
            { code: '040', label: '(Unassigned)' },
            { code: '050', label: 'Magazines & Serials' },
            { code: '060', label: 'Associations & Museums' },
            { code: '070', label: 'Journalism & Publishing' },
            { code: '080', label: 'Quotations & General Collections' },
            { code: '090', label: 'Manuscripts & Rare Books' },
        ]
    },
    {
        code: '100', label: 'Philosophy & Psychology', shortLabel: 'Philosophy & Psych',
        divisions: [
            { code: '100', label: 'Philosophy' },
            { code: '110', label: 'Metaphysics' },
            { code: '120', label: 'Epistemology, Causation, Humankind' },
            { code: '130', label: 'Parapsychology & Occultism' },
            { code: '140', label: 'Philosophical Schools of Thought' },
            { code: '150', label: 'Psychology' },
            { code: '160', label: 'Logic' },
            { code: '170', label: 'Ethics' },
            { code: '180', label: 'Ancient & Medieval Philosophy' },
            { code: '190', label: 'Modern Western Philosophy' },
        ]
    },
    {
        code: '200', label: 'Religion', shortLabel: 'Religion',
        divisions: [
            { code: '200', label: 'Religion' },
            { code: '210', label: 'Philosophy & Theory of Religion' },
            { code: '220', label: 'The Bible' },
            { code: '230', label: 'Christian Theology' },
            { code: '240', label: 'Christian Practice & Devotion' },
            { code: '250', label: 'Christian Orders & Local Church' },
            { code: '260', label: 'Christian Social Theology' },
            { code: '270', label: 'Christian History' },
            { code: '280', label: 'Christian Denominations' },
            { code: '290', label: 'Other & Comparative Religions' },
        ]
    },
    {
        code: '300', label: 'Social Sciences', shortLabel: 'Social Sciences',
        divisions: [
            { code: '300', label: 'Social Sciences' },
            { code: '310', label: 'Statistics' },
            { code: '320', label: 'Political Science' },
            { code: '330', label: 'Economics' },
            { code: '340', label: 'Law' },
            { code: '350', label: 'Public Administration & Military Science' },
            { code: '360', label: 'Social Problems & Social Services' },
            { code: '370', label: 'Education' },
            { code: '380', label: 'Commerce, Communications & Transport' },
            { code: '390', label: 'Customs & Folklore' },
        ]
    },
    {
        code: '400', label: 'Language', shortLabel: 'Language',
        divisions: [
            { code: '400', label: 'Language' },
            { code: '410', label: 'Linguistics' },
            { code: '420', label: 'English' },
            { code: '430', label: 'German' },
            { code: '440', label: 'French' },
            { code: '450', label: 'Italian' },
            { code: '460', label: 'Spanish' },
            { code: '470', label: 'Latin' },
            { code: '480', label: 'Greek' },
            { code: '490', label: 'Other Languages' },
        ]
    },
    {
        code: '500', label: 'Science & Mathematics', shortLabel: 'Science & Math',
        divisions: [
            { code: '500', label: 'Science' },
            { code: '510', label: 'Mathematics' },
            { code: '520', label: 'Astronomy' },
            { code: '530', label: 'Physics' },
            { code: '540', label: 'Chemistry' },
            { code: '550', label: 'Earth Sciences' },
            { code: '560', label: 'Paleontology' },
            { code: '570', label: 'Life Sciences & Biology' },
            { code: '580', label: 'Botany' },
            { code: '590', label: 'Zoology' },
        ]
    },
    {
        code: '600', label: 'Technology', shortLabel: 'Technology',
        divisions: [
            { code: '600', label: 'Technology' },
            { code: '610', label: 'Medicine' },
            { code: '620', label: 'Engineering' },
            { code: '630', label: 'Agriculture' },
            { code: '640', label: 'Home & Family Living' },
            { code: '650', label: 'Management & Business' },
            { code: '660', label: 'Chemical Engineering' },
            { code: '670', label: 'Manufacturing' },
            { code: '680', label: 'Specific Manufactured Products' },
            { code: '690', label: 'Building & Construction' },
        ]
    },
    {
        code: '700', label: 'Arts & Recreation', shortLabel: 'Arts & Recreation',
        divisions: [
            { code: '700', label: 'Arts' },
            { code: '710', label: 'Landscaping & Urban Design' },
            { code: '720', label: 'Architecture' },
            { code: '730', label: 'Sculpture' },
            { code: '740', label: 'Drawing & Decorative Arts' },
            { code: '750', label: 'Painting' },
            { code: '760', label: 'Printmaking' },
            { code: '770', label: 'Photography' },
            { code: '780', label: 'Music' },
            { code: '790', label: 'Recreation & Sports' },
        ]
    },
    {
        code: '800', label: 'Literature', shortLabel: 'Literature',
        divisions: [
            { code: '800', label: 'Literature & Rhetoric' },
            { code: '810', label: 'American Literature (English)' },
            { code: '820', label: 'English Literature' },
            { code: '830', label: 'German Literature' },
            { code: '840', label: 'French Literature' },
            { code: '850', label: 'Italian Literature' },
            { code: '860', label: 'Spanish Literature' },
            { code: '870', label: 'Latin Literature' },
            { code: '880', label: 'Greek Literature' },
            { code: '890', label: 'Other Literatures' },
        ]
    },
    {
        code: '900', label: 'History & Geography', shortLabel: 'History & Geography',
        divisions: [
            { code: '900', label: 'History' },
            { code: '910', label: 'Geography & Travel' },
            { code: '920', label: 'Biography & Genealogy' },
            { code: '930', label: 'Ancient History' },
            { code: '940', label: 'European History' },
            { code: '950', label: 'Asian History' },
            { code: '960', label: 'African History' },
            { code: '970', label: 'North American History' },
            { code: '980', label: 'South American History' },
            { code: '990', label: 'History of Other Areas' },
        ]
    },
];

export function getDdcClassLabel(code: string): string {
    const cls = DDC_CLASSES.find(c => c.code === code);
    return cls ? cls.label : code;
}

export function getDdcDivisionLabel(majorCode: string, divisionCode: string): string {
    const cls = DDC_CLASSES.find(c => c.code === majorCode);
    const div = cls?.divisions.find(d => d.code === divisionCode);
    return div ? div.label : divisionCode;
}

export function getDdcFullLabel(code: string | null | undefined): string {
    if (!code) return '';
    const majorCode = code.slice(0, 1) + '00';
    const cls = DDC_CLASSES.find(c => c.code === majorCode);
    if (!cls) return code;
    if (code === majorCode) return cls.label;
    const div = cls.divisions.find(d => d.code === code);
    return div ? `${cls.label} / ${div.label}` : cls.label;
}
