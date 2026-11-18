/* Initial requirement lines for the TUMC tracker. Requirements only: no candidate names, no commercials. */
window.TUMC_SEED = (function () {
  var FIN_SPEC = 'Experience in financial assessment and analysis of real estate projects, transaction advisory services, project feasibility studies, financial modelling, investment analysis, project cost and revenue assessment, cash flow analysis, and other related financial analyses.';
  var CS_SPEC = 'Experience in company formation and incorporation, maintenance of statutory records and registers, preparation and coordination of Board Meeting notices, agendas, notes and minutes, convening and conducting Board and General Meetings, preparation and filing of statutory forms and returns, corporate governance and regulatory compliance, and liaison with the Registrar of Companies (ROC), statutory authorities and other regulatory bodies.';
  var LEGAL_SPEC = 'Experience in land and property-related matters, real estate and infrastructure projects, and corporate and legal matters.';
  var LAND_SPEC = 'Experience in handling land-related matters and resolving land issues, including land suitability assessment, verification and interpretation of land records, revenue records, property cards, 7/12 extracts, mutation entries and other relevant land documents.';
  var FIN_QUAL = "Bachelor's degree in Commerce, Accounting, Finance, Business Administration or any other related discipline";
  var LAW_QUAL = "Bachelor's degree in Law";
  var O = { batch: 'Original requirement', batchOrder: 1, source: 'TUMC Manpower Details for KPC, dated 9 Sep 2026', receivedOn: '2026-09-09',
            toShare: 'CVs, relevant experience, availability, proposed deployment structure' };
  var A1 = { batch: 'Additional requirement 1', batchOrder: 2, source: 'TUMC additional requirement table', receivedOn: '' };
  var ARCH_JD = [
    'Lead the architectural design process, from initial concept development to detailed construction and municipal drawings',
    'Manage multiple projects simultaneously, ensuring adherence to timelines, budgets and quality standards',
    'Collaborate with clients, engineers, contractors and other stakeholders to translate design requirements into practical solutions',
    'Provide mentorship and guidance to junior architects and team members',
    'Stay updated on industry trends, building codes and regulations to ensure compliance and innovation in design',
    'Proficiency in architectural software such as AutoCAD, Revit, SketchUp and Adobe Creative Suite',
    'Strong design portfolio showcasing a range of projects and design styles',
    'Excellent communication, leadership and project management skills',
    'Professional licensure or eligibility for licensure preferred'
  ];
  var PLAN_JD = [
    'Minimum 3 to 8 years of experience required',
    'Experience in managing urban renewal, preparation of DP / RP / TPS',
    'Strong analytical and problem-solving skills',
    'Knowledge of urban planning principles, MRTP Act, land use regulations and sustainable development practices',
    'Familiarity with urban planning software and GIS tools',
    'Excellent communication and presentation skills to interact with diverse stakeholders',
    'Ability to work collaboratively in multidisciplinary teams',
    'A passion for urban development and improving the quality of life in cities'
  ];
  function m(base, extra) { var o = {}, k; for (k in base) o[k] = base[k]; for (k in extra) o[k] = extra[k]; return o; }
  return [
    m(O, { id: 'o-fin-cons', order: 1, stream: 'Finance', designation: 'Finance Consultant', level: 'Consultant', nos: 1, minExp: '7+ years', qualification: FIN_QUAL, specificExp: FIN_SPEC }),
    m(O, { id: 'o-fin-ac', order: 2, stream: 'Finance', designation: 'Associate Consultant', level: 'Associate Consultant', nos: 3, minExp: '5+ years', qualification: FIN_QUAL, specificExp: FIN_SPEC }),
    m(O, { id: 'o-fin-an', order: 3, stream: 'Finance', designation: 'Analyst', level: 'Analyst', nos: 2, minExp: '3+ years', qualification: FIN_QUAL, specificExp: FIN_SPEC }),
    m(O, { id: 'o-cs-ac', order: 4, stream: 'Company Secretary', designation: 'Associate Consultant', level: 'Associate Consultant', nos: 3, minExp: '5+ years', qualification: 'Bachelor degree in any field, with ICSI registration', specificExp: CS_SPEC }),
    m(O, { id: 'o-leg-cons', order: 5, stream: 'Legal', designation: 'Consultant', level: 'Consultant', nos: 1, minExp: '7+ years', qualification: LAW_QUAL, specificExp: LEGAL_SPEC }),
    m(O, { id: 'o-leg-ac', order: 6, stream: 'Legal', designation: 'Associate Consultant', level: 'Associate Consultant', nos: 1, minExp: '5+ years', qualification: LAW_QUAL, specificExp: LEGAL_SPEC }),
    m(O, { id: 'o-leg-asst', order: 7, stream: 'Legal', designation: 'Assistant Consultant', level: 'Assistant Consultant', nos: 4, minExp: '3+ years', qualification: LAW_QUAL, specificExp: LEGAL_SPEC }),
    m(O, { id: 'o-land-cons', order: 8, stream: 'Land', designation: 'Consultant', level: 'Consultant', nos: 1, minExp: '7+ years', qualification: 'Any graduate', specificExp: LAND_SPEC }),
    m(O, { id: 'o-land-ac', order: 9, stream: 'Land', designation: 'Associate Consultant', level: 'Associate Consultant', nos: 6, minExp: '5+ years', qualification: 'Any graduate', specificExp: LAND_SPEC }),

    m(A1, { id: 'a-fin-an', order: 1, stream: 'Finance', designation: 'Financial Analyst', level: 'Analyst', nos: 4, minExp: 'Not specified', qualification: FIN_QUAL, specificExp: '' }),
    m(A1, { id: 'a-cs', order: 2, stream: 'Company Secretary', designation: 'Company Secretary', level: 'Associate Consultant', nos: 1, minExp: 'Not specified', qualification: 'Bachelor degree in any field, with ICSI registration', specificExp: '' }),
    m(A1, { id: 'a-land-rec', order: 3, stream: 'Land', designation: 'Land and Records Officer / Manager', level: '', nos: 2, minExp: '5+ years', qualification: 'Any graduate', specificExp: '' }),
    m(A1, { id: 'a-land-acq', order: 4, stream: 'Land', designation: 'Land Acquisition Officer', level: '', nos: 2, minExp: '5+ years', qualification: 'Any graduate', specificExp: '' }),
    m(A1, { id: 'a-leg-off', order: 5, stream: 'Legal', designation: 'Legal Officer', level: '', nos: 2, minExp: '5+ years', qualification: LAW_QUAL, specificExp: '' }),

    { id: 'arch-sr', batch: 'Additional requirement 2: Architects', batchOrder: 3, order: 1, stream: 'Architecture', designation: 'Architect', level: 'Senior', nos: 1, minExp: '5+ years',
      qualification: "Bachelor's or Master's degree in Architecture from an accredited institution", specificExp: '', source: 'Email from Sahil More, TUMC, 13 Nov 2026', receivedOn: '2026-11-13',
      toShare: 'Suitable profiles with experience details', jd: ARCH_JD },
    { id: 'arch-mid', batch: 'Additional requirement 2: Architects', batchOrder: 3, order: 2, stream: 'Architecture', designation: 'Architect', level: 'Mid-level', nos: 2, minExp: '3+ years',
      qualification: "Bachelor's or Master's degree in Architecture from an accredited institution", specificExp: '', source: 'Email from Sahil More, TUMC, 13 Nov 2026', receivedOn: '2026-11-13',
      toShare: 'Suitable profiles with experience details', jd: ARCH_JD },

    { id: 'plan-sr', batch: 'Additional requirement 3: Urban Planners', batchOrder: 4, order: 1, stream: 'Urban Planning', designation: 'Urban Planner', level: 'Senior', nos: 2, minExp: '5+ years',
      qualification: "Bachelor's or Master's degree in Urban Planning, Architecture or a related field", specificExp: '', source: 'Email from Aditi Pathak, TUMC HR, 17 Nov 2026', receivedOn: '2026-11-17',
      toShare: 'Profiles, updated resumes, experience details', jd: PLAN_JD },
    { id: 'plan-mid', batch: 'Additional requirement 3: Urban Planners', batchOrder: 4, order: 2, stream: 'Urban Planning', designation: 'Urban Planner', level: 'Mid-level', nos: 2, minExp: '3+ years',
      qualification: "Bachelor's or Master's degree in Urban Planning, Architecture or a related field", specificExp: '', source: 'Email from Aditi Pathak, TUMC HR, 17 Nov 2026', receivedOn: '2026-11-17',
      toShare: 'Profiles, updated resumes, experience details', jd: PLAN_JD }
  ];
})();
