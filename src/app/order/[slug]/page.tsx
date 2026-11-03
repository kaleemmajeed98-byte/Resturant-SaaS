import Storefront from "./storefront";

export default async function RestaurantOrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Storefront restaurantSlug={slug} branchSlug="main" />;
}
