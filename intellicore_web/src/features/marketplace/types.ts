export type MarketplaceAdvertisement = {
  id: string;
  category_id?: string | null;
  category_name?: string | null;
  title: string;
  description?: string | null;
  price?: number | string | null;
  currency?: string | null;
  location?: string | null;
  image_urls?: string[] | null;
  video_url?: string | null;
  published_at?: string | null;
  expires_at?: string | null;
  views_count?: number | null;
  seller_id?: string | null;
  seller_first_name?: string | null;
  seller_last_name?: string | null;
  seller_profile_image_url?: string | null;
  company_name?: string | null;
  company_logo_url?: string | null;
  seller_verified?: boolean | null;
  is_verified?: boolean | null;
  is_featured?: boolean | null;
  avg_rating?: number | null;
  rating_count?: number | null;
  seller_average_rating?: number | null;
  seller_review_count?: number | null;
  is_owner?: boolean | null;
};

export type MarketplaceCategory = {
  id: string;
  name: string;
  icon?: string | null;
};

export type MarketplaceListResponse = {
  success?: boolean;
  message?: string;
  data?: MarketplaceAdvertisement[];
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
};

export type MarketplaceCategoryResponse = {
  success?: boolean;
  message?: string;
  data?: MarketplaceCategory[];
};

export type MarketplaceAdvertisementResponse = {
  success?: boolean;
  code?: string;
  message?: string;
  data?: MarketplaceAdvertisement;
};

export type MarketplaceSavedStatusResponse = {
  success?: boolean;
  code?: string;
  message?: string;
  data?: {
    is_saved?: boolean;
  };
};

export type MarketplaceEnquiryResponse = {
  success?: boolean;
  code?: string;
  message?: string;
  data?: {
    conversation?: {
      id?: string;
    };
    message?: {
      id?: string;
    };
  };
};
