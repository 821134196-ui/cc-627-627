import { PrismaClient } from '@prisma/client';
import { StaffRole } from '../src/domain/enums';

const prisma = new PrismaClient();

async function main() {
  // 岗位人员：制作 / 巡查 / 试吃台发放 分离
  const staffSeed = [
    { name: '王制作', role: StaffRole.MAKER },
    { name: '李巡查', role: StaffRole.INSPECTOR },
    { name: '赵试吃', role: StaffRole.SERVER },
  ];
  for (const s of staffSeed) {
    await prisma.staff.upsert({ where: { name: s.name }, update: {}, create: s });
  }

  const batchSeed = [
    { code: 'B20261005-01', name: '切达奶酪块', supplier: '北方乳品厂', allergens: ['乳制品'] },
    { code: 'B20261005-02', name: '混合坚果碎', supplier: '山林坚果', allergens: ['坚果', '花生'] },
    { code: 'B20261005-03', name: '全麦面包片', supplier: '麦田烘焙', allergens: ['麸质谷物'] },
  ];
  for (const b of batchSeed) {
    await prisma.ingredientBatch.upsert({
      where: { code: b.code },
      update: {},
      create: { ...b, allergens: JSON.stringify(b.allergens) },
    });
  }
  console.log('✅ 种子数据完成：3 名员工、3 个原料批次');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
