exports.up = function (knex) {
  return knex.schema.createTable("students", function (table) {
    // 1. id - avtomatik o'sib boradigan asosiy kalit
    table.increments("id").primary();

    // 2. phone_number - telefon raqam
    table.string("phone_number");

    // 3. telegram_id - Telegram ID (juda katta son bo'lishi mumkin, shuning uchun bigInteger)
    // unique() qildik, chunki bitta ID faqat bir marta ro'yxatdan o'tishi kerak
    table.bigInteger("telegram_id").notNullable().unique();

    // 4. first_name - so'rashligi shart bo'lgani uchun notNullable() qo'shildi (bo'sh bo'lishi mumkin emas)
    table.string("first_name").notNullable();

    // 5. created_at - qachon ro'yxatdan o'tganini avtomatik yozib boradi
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  // Migration bekor qilinganda jadvalni o'chirib tashlash uchun
  return knex.schema.dropTable("students");
};
