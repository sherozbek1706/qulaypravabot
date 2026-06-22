/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable("withdrawal_requests", function (table) {
    table.increments("id").primary();
    table.integer("student_id").unsigned().notNullable().references("id").inTable("students").onDelete("CASCADE");
    table.integer("amount").notNullable();
    table.string("card_number", 16).notNullable();
    table.string("status", 20).notNullable().defaultTo("pending");
    table.text("rejection_reason").nullable();
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable("withdrawal_requests");
};
