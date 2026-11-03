import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const restaurants = [
  { slug: "ember-burger", name: "Ember Burger", theme: "modern", color: "#bb402b", category: "Burgers", items: [["Ember Classic", "Smash patty, cheddar, house sauce", 1299], ["Crispy Chicken", "Buttermilk chicken, pickles", 1199]] as const },
  { slug: "casa-luna", name: "Casa Luna", theme: "premium", color: "#68734b", category: "Dinner", items: [["Wild Mushroom Risotto", "Porcini, parmesan, herbs", 2199], ["Roast Chicken", "Lemon, thyme, seasonal greens", 2599]] as const },
  { slug: "little-crumb", name: "Little Crumb", theme: "cafe", color: "#a76542", category: "Bakery", items: [["Almond Croissant", "Butter pastry, toasted almonds", 550], ["Cardamom Bun", "Freshly baked each morning", 475]] as const },
];

async function main() {
  for (const restaurant of restaurants) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: restaurant.slug },
      update: { name: restaurant.name, theme: restaurant.theme, published: true },
      create: { slug: restaurant.slug, name: restaurant.name, theme: restaurant.theme, published: true },
    });
    await prisma.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      update: { primaryColor: restaurant.color, description: `Welcome to ${restaurant.name}.` },
      create: { tenantId: tenant.id, primaryColor: restaurant.color, description: `Welcome to ${restaurant.name}.` },
    });
    const category = await prisma.category.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: restaurant.category } },
      update: {}, create: { tenantId: tenant.id, name: restaurant.category },
    });
    for (const [name, description, priceCents] of restaurant.items) {
      const existing = await prisma.product.findFirst({ where: { tenantId: tenant.id, name } });
      if (existing) await prisma.product.update({ where: { id: existing.id }, data: { description, priceCents, categoryId: category.id } });
      else await prisma.product.create({ data: { tenantId: tenant.id, categoryId: category.id, name, description, priceCents } });
    }
  }
}

main().finally(() => prisma.$disconnect());
