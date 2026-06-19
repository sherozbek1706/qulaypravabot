exports.up = function (knex) {
  return knex.schema.createTable("attempts", function (table) {
    table.increments("id").primary();
    table
      .integer("student_id")
      .unsigned()
      .references("id")
      .inTable("students")
      .onDelete("CASCADE")
      .notNullable();
    table.integer("correct_answers").notNullable();
    table.integer("total_questions").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("attempts");
};
