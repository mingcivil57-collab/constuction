import { Project } from "../types";
import { getDefaultPeriodicProgress } from "./periodicUtils";
import { calculateProjectTimeline } from "./dateUtils";

export function getMockDemoProjects(): Project[] {
  const masterRows = [
    // FY 2569
    ["2569", "แผนงานที่ 1", "โครงการก่อสร้างทางหลวงชนบทตัดผ่านป่าชุมชน", "โครงการก่อสร้างทางหลวงชนบทตัดผ่านป่าชุมชน", 2400000],
    ["2569", "แผนงานที่ 1", "โครงการติดตั้งไฟส่องสว่างพลังงานแสงอาทิตย์ ตลาดสด", "โครงการติดตั้งไฟส่องสว่างพลังงานแสงอาทิตย์ ตลาดสด", 850000],
    ["2569", "แผนงานที่ 2", "โครงการขุดลอกคลองส่งน้ำเพื่อการเกษตรสายใหญ่", "โครงการขุดลอกคลองส่งน้ำเพื่อการเกษตรสายใหญ่", 3200000],
    ["2569", "แผนงานที่ 2", "โครงการปรับปรุงอาคารสโมสรและลานกีฬาอเนกประสงค์", "โครงการปรับปรุงอาคารสโมสรและลานกีฬาอเนกประสงค์", 1500000],
    ["2569", "แผนงานที่ 3", "โครงการก่อสร้างทำนบดินหัวงานอ่างเก็บน้ำขนาดเล็ก", "โครงการก่อสร้างทำนบดินหัวงานอ่างเก็บน้ำขนาดเล็ก", 4800000],
    ["2569", "แผนงานที่ 3", "โครงการขยายเขตระบบจำหน่ายน้ำประปาหมู่บ้าน", "โครงการขยายเขตระบบจำหน่ายน้ำประปาหมู่บ้าน", 1100000],
    ["2569", "แผนงานที่ 4", "โครงการปรับปรุงผิวจราจรลาดยางแอสฟัลท์ติก", "โครงการปรับปรุงผิวจราจรลาดยางแอสฟัลท์ติก", 3900000],
    // FY 2570
    ["2570", "แผนงานที่ 1", "โครงการก่อสร้างสะพาน คสล. ข้ามคลองเปรมประชากร", "โครงการก่อสร้างสะพาน คสล. ข้ามคลองเปรมประชากร", 5600000],
    ["2570", "แผนงานที่ 1", "โครงการปรับภูมิทัศน์และก่อสร้างทางจักรยานรอบบึง", "โครงการปรับภูมิทัศน์และก่อสร้างทางจักรยานรอบบึง", 2100000],
    ["2570", "แผนงานที่ 2", "โครงการก่อสร้างโรงกรองน้ำดื่มสะอาดระบบออสโมซิส", "โครงการก่อสร้างโรงกรองน้ำดื่มสะอาดระบบออสโมซิส", 3500000],
    ["2570", "แผนงานที่ 2", "โครงการซ่อมแซมฝายกั้นน้ำเพื่อบรรเทาภัยแล้ง", "โครงการซ่อมแซมฝายกั้นน้ำเพื่อบรรเทาภัยแล้ง", 950000],
    ["2570", "แผนงานที่ 3", "โครงการติดตั้งระบบกระจายสัญญาณ Wi-Fi ชุมชนเสาไฟ", "โครงการติดตั้งระบบกระจายสัญญาณ Wi-Fi ชุมชนเสาไฟ", 1200000],
    ["2570", "แผนงานที่ 3", "โครงการพัฒนาศูนย์การเรียนรู้ ICT ชุมชนประจำตำบล", "โครงการพัฒนาศูนย์การเรียนรู้ ICT ชุมชนประจำตำบล", 1800000],
    ["2570", "แผนงาน & ภัยแล้ง", "โครงการเจาะบ่อบาดาลน้ำลึกและถังเก็บน้ำทรงแชมเปญ", "โครงการเจาะบ่อบาดาลน้ำลึกและถังเก็บน้ำทรงแชมเปญ", 2500000],
    ["2570", "แผนงานสิ่งแวดล้อม", "โครงการจัดสร้างศูนย์คัดแยกขยะรีไซเคิลชุมชนต้นแบบ", "โครงการจัดสร้างศูนย์คัดแยกขยะรีไซเคิลชุมชนต้นแบบ", 1600000],
  ];

  const personnel = {
    chairmen: ["นายสมชาย เข็มทอง", "นางสาววิภา พรอำนวย", "นายประสิทธิ์ รัตนสกุล", "นายธวัชชัย ดำรงดี"],
    comm1: ["นายสุทิน บัวตูม", "นางปราณี ดีใจ", "นายอภิชาติ คล่องแคล่ว", "นายอำนาจ พิทักษ์ไทย"],
    comm2: ["นายมานะ อุดมจิต", "นายวีระ แก้วมณี", "นางสาวสมศรี สดใส", "นายไพโรจน์ กิจเจริญ"],
    heads: ["วิศวกรอาวุโส นายนพดล", "สถาปนิก นายพีระศักดิ์", "วิศวกรโยธา นายอนุชิต", "นายช่างใหญ่ บัญชา"],
    supervisors: ["นายพิชัย ทวีคูณ", "นายชาญชัย ดำเนินการ", "นางสาวธิดา ใฝ่เรียน", "นายอาทิตย์ เรืองรอง"],
    contractors: ["หจก. เมืองไทยการโยธา", "บริษัท เจริญก้าวหน้าก่อสร้าง จำกัด", "หจก. ชลบุรีคอนกรีต", "บริษัท ยูไนเต็ดอินฟรา จำกัด"],
  };

  const today = new Date("2026-07-22");

  return masterRows.map((row, i) => {
    const fy = row[0] as string;
    const plan = row[1] as string;
    const pName = row[2] as string;
    const tabName = row[3] as string;
    const budget = row[4] as number;

    const contractAmt = Math.round(budget * 0.95);
    const contractNo = `${Math.floor(i * 3 + 12)}/25${fy === "2569" ? "69" : "70"}`;
    const sigDate = `${parseInt(fy) - 543}-02-15`;
    const stDate = `${parseInt(fy) - 543}-03-01`;
    const edDate = `${parseInt(fy) - 543}-09-01`;
    const duration = 184;

    const contractor = personnel.contractors[i % personnel.contractors.length];
    const chairman = personnel.chairmen[i % personnel.chairmen.length];
    const comm1 = personnel.comm1[i % personnel.comm1.length];
    const comm2 = personnel.comm2[i % personnel.comm2.length];
    const head = personnel.heads[i % personnel.heads.length];
    const supervisor = personnel.supervisors[i % personnel.supervisors.length];

    let progressP = 100;
    let progressF = 100;
    let disbursed = contractAmt;

    if (fy === "2570") {
      progressP = Math.floor((i * 7 + 35) % 60) + 30;
      progressF = progressP + (i % 2 === 0 ? 3 : -4);
      disbursed = Math.round(contractAmt * (progressF / 100));
    } else if (i === 6) {
      progressP = 90;
      progressF = 84;
      disbursed = Math.round(contractAmt * 0.75);
    }

    // Days calculation via calculateProjectTimeline
    const timeline = calculateProjectTimeline(stDate, edDate, duration);

    // Sample coordinates for Thailand locations based on index
    const sampleCoords = [
      { lat: 13.7563, lng: 100.5018, name: "เขตราชเทวี กรุงเทพมหานคร" },
      { lat: 18.7883, lng: 98.9853, name: "อำเภอเมือง เชียงใหม่" },
      { lat: 16.4322, lng: 102.8236, name: "อำเภอเมือง ขอนแก่น" },
      { lat: 12.9236, lng: 100.8825, name: "อำเภอบางละมุง ชลบุรี" },
    ];
    const coords = sampleCoords[i % sampleCoords.length];

    const project: Project = {
      fiscalYear: fy,
      planName: plan,
      projectName: pName,
      sheetName: tabName,
      lat: coords.lat,
      lng: coords.lng,
      locationName: coords.name,
      budget,
      contractAmount: contractAmt,
      contractNumber: contractNo,
      signedDate: sigDate,
      startDate: stDate,
      endDate: edDate,
      contractDays: timeline.contractDays,
      elapsedDays: timeline.elapsedDays,
      remainingDays: timeline.remainingDays,
      suspensions: i === 2 ? [{ start: `${parseInt(fy) - 543}-05-01`, end: `${parseInt(fy) - 543}-05-15`, reason: "ฝนตกชุกชะลอก่อสร้าง" }] : [],
      contractor,
      chairman,
      committee1: comm1,
      committee2: comm2,
      supervisorHead: head,
      supervisor,
      acceptedDate: progressP === 100 ? edDate : "-",
      progressPlan: progressP,
      progressField: progressF,
      disbursedAmount: disbursed,
      disbursedPercent: contractAmt > 0 ? Math.round((disbursed / contractAmt) * 100) : 0,
      tasks: [
        {
          id: "1",
          name: "เตรียมการก่อสร้างและปรับระดับพื้นที่",
          startDate: stDate,
          endDate: `${parseInt(fy) - 543}-03-15`,
          progress: 100,
        },
        {
          id: "2",
          name: "งานขุดเจาะ/ฐานรากเสาเข็ม",
          startDate: `${parseInt(fy) - 543}-03-16`,
          endDate: `${parseInt(fy) - 543}-04-15`,
          progress: progressP > 60 ? 100 : 80,
        },
        {
          id: "3",
          name: "งานโครงสร้าง คสล. คาน-เสา",
          startDate: `${parseInt(fy) - 543}-04-16`,
          endDate: `${parseInt(fy) - 543}-06-15`,
          progress: progressP > 80 ? 100 : 40,
        },
        {
          id: "4",
          name: "งานโครงสร้างชั้นบนและพื้นคอนกรีต",
          startDate: `${parseInt(fy) - 543}-06-16`,
          endDate: `${parseInt(fy) - 543}-07-31`,
          progress: progressP > 95 ? 100 : 0,
        },
      ],
      updates: [
        {
          date: `${parseInt(fy) - 543}-03-10`,
          details: "ผู้รับจ้างนำเข้าเครื่องจักรและปรับระดับหน้างานเสร็จเรียบร้อย",
          reporter: supervisor,
        },
        {
          date: `${parseInt(fy) - 543}-05-12`,
          details: "เทคอนกรีตฐานรากสำเร็จไปแล้ว มีการตรวจสอบคุณภาพวัสดุหน้างาน",
          reporter: supervisor,
        },
      ],
      disbursements: [
        {
          periodNo: 1,
          amount: Math.round(contractAmt * 0.25),
          disbursedDate: `${parseInt(fy) - 543}-03-20`,
          status: "เบิกจ่ายแล้ว",
          remarks: "เบิกจ่ายงวดเริ่มแรกเตรียมพื้นที่สำเร็จ",
        },
        {
          periodNo: 2,
          amount: Math.round(contractAmt * 0.25),
          disbursedDate: progressP > 60 ? `${parseInt(fy) - 543}-04-20` : "-",
          status: progressP > 60 ? "เบิกจ่ายแล้ว" : "ยังไม่เบิกจ่าย",
          remarks: "เบิกจ่ายงวดเสาเข็มและคานคอดิน",
        },
        {
          periodNo: 3,
          amount: Math.round(contractAmt * 0.25),
          disbursedDate: progressP > 80 ? `${parseInt(fy) - 543}-06-25` : "-",
          status: progressP > 80 ? "เบิกจ่ายแล้ว" : "ยังไม่เบิกจ่าย",
          remarks: "เบิกจ่ายงวดเทคาน-เสา",
        },
        {
          periodNo: 4,
          amount: Math.round(contractAmt * 0.25),
          disbursedDate: progressP > 95 ? `${parseInt(fy) - 543}-08-10` : "-",
          status: progressP > 95 ? "เบิกจ่ายแล้ว" : "ยังไม่เบิกจ่าย",
          remarks: "งวดสุดท้ายหลังส่งมอบงาน",
        },
      ],
      photos: [
        {
          imageUrl: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=600&q=80",
          date: `${parseInt(fy) - 543}-03-10`,
          remarks: "ผู้รับจ้างปรับระดับดินและเข้าพื้นที่หน้างาน",
        },
        {
          imageUrl: "https://images.unsplash.com/photo-1581094288338-2314dddb7ecc?auto=format&fit=crop&w=600&q=80",
          date: `${parseInt(fy) - 543}-04-05`,
          remarks: "เครื่องตอกเสาเข็มเริ่มตอกเสาเข็มทดสอบ",
        },
        {
          imageUrl: "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&w=600&q=80",
          date: `${parseInt(fy) - 543}-05-12`,
          remarks: "เทหล่อคานคอดินหลักเสร็จเรียบร้อย",
        },
      ],
    };

    project.periodicProgress = getDefaultPeriodicProgress(project);
    return project;
  });
}
