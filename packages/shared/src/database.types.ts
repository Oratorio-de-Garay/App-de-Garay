export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      asistencias: {
        Row: {
          created_at: string;
          fecha: string;
          id: string;
          organizacion_id: string;
          pibe_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          fecha: string;
          id?: string;
          organizacion_id: string;
          pibe_id?: string;
        };
        Update: {
          created_at?: string;
          fecha?: string;
          id?: string;
          organizacion_id?: string;
          pibe_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "asistencias_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "asistencias_pibe_id_fkey";
            columns: ["pibe_id"];
            isOneToOne: false;
            referencedRelation: "pibes";
            referencedColumns: ["id"];
          },
        ];
      };
      auditoria_admin: {
        Row: {
          accion: string;
          actor_email: string;
          created_at: string;
          detalle: NonNullable<Json>;
          id: string;
          objetivo_email: string | null;
          organizacion_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          accion: string;
          actor_email: string;
          created_at?: string;
          detalle?: NonNullable<Json>;
          id?: string;
          objetivo_email?: string | null;
          organizacion_id?: string | null;
        };
        Update: {
          accion?: string;
          actor_email?: string;
          created_at?: string;
          detalle?: NonNullable<Json>;
          id?: string;
          objetivo_email?: string | null;
          organizacion_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "auditoria_admin_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      buffet_budget_items: {
        Row: {
          budget_id: string;
          combo_id: string | null;
          created_at: string;
          description: string;
          id: string;
          line_total: number;
          organizacion_id: string;
          product_id: string | null;
          quantity: number;
          unit_price: number;
        };
        ComputedFields: never;
        Insert: {
          budget_id: string;
          combo_id?: string | null;
          created_at?: string;
          description: string;
          id?: string;
          line_total?: number;
          organizacion_id: string;
          product_id?: string | null;
          quantity?: number;
          unit_price?: number;
        };
        Update: {
          budget_id?: string;
          combo_id?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          line_total?: number;
          organizacion_id?: string;
          product_id?: string | null;
          quantity?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "buffet_budget_items_budget_id_fkey";
            columns: ["budget_id"];
            isOneToOne: false;
            referencedRelation: "buffet_budgets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "buffet_budget_items_combo_id_fkey";
            columns: ["combo_id"];
            isOneToOne: false;
            referencedRelation: "buffet_combos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "buffet_budget_items_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "buffet_budget_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "buffet_products";
            referencedColumns: ["id"];
          },
        ];
      };
      buffet_budgets: {
        Row: {
          client_name: string | null;
          created_at: string;
          id: string;
          observation: string | null;
          organizacion_id: string;
          status: string;
          title: string;
          total_amount: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          client_name?: string | null;
          created_at?: string;
          id?: string;
          observation?: string | null;
          organizacion_id: string;
          status?: string;
          title: string;
          total_amount?: number;
          updated_at?: string;
        };
        Update: {
          client_name?: string | null;
          created_at?: string;
          id?: string;
          observation?: string | null;
          organizacion_id?: string;
          status?: string;
          title?: string;
          total_amount?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "buffet_budgets_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      buffet_categories: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          organizacion_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          organizacion_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          organizacion_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "buffet_categories_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      buffet_combo_items: {
        Row: {
          combo_id: string;
          created_at: string;
          id: string;
          organizacion_id: string;
          product_id: string;
          quantity: number;
        };
        ComputedFields: never;
        Insert: {
          combo_id: string;
          created_at?: string;
          id?: string;
          organizacion_id: string;
          product_id: string;
          quantity?: number;
        };
        Update: {
          combo_id?: string;
          created_at?: string;
          id?: string;
          organizacion_id?: string;
          product_id?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "buffet_combo_items_combo_id_fkey";
            columns: ["combo_id"];
            isOneToOne: false;
            referencedRelation: "buffet_combos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "buffet_combo_items_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "buffet_combo_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "buffet_products";
            referencedColumns: ["id"];
          },
        ];
      };
      buffet_combos: {
        Row: {
          active: boolean;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          organizacion_id: string;
          sale_price: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          organizacion_id: string;
          sale_price?: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          organizacion_id?: string;
          sale_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "buffet_combos_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      buffet_eventos: {
        Row: {
          created_at: string;
          estado: string;
          fecha: string;
          id: string;
          nombre: string;
          observacion: string | null;
          organizacion_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          estado?: string;
          fecha?: string;
          id?: string;
          nombre: string;
          observacion?: string | null;
          organizacion_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          estado?: string;
          fecha?: string;
          id?: string;
          nombre?: string;
          observacion?: string | null;
          organizacion_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "buffet_eventos_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      buffet_product_costs: {
        Row: {
          active: boolean;
          cost: number;
          created_at: string;
          id: string;
          observation: string | null;
          organizacion_id: string;
          pack_size: number;
          product_id: string;
          supplier_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          cost: number;
          created_at?: string;
          id?: string;
          observation?: string | null;
          organizacion_id: string;
          pack_size?: number;
          product_id: string;
          supplier_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          cost?: number;
          created_at?: string;
          id?: string;
          observation?: string | null;
          organizacion_id?: string;
          pack_size?: number;
          product_id?: string;
          supplier_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "buffet_product_costs_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "buffet_product_costs_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "buffet_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "buffet_product_costs_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "buffet_suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      buffet_products: {
        Row: {
          active: boolean;
          category_id: string | null;
          created_at: string;
          id: string;
          is_donated: boolean;
          name: string;
          observation: string | null;
          organizacion_id: string;
          sale_price: number;
          stock_current: number;
          unit_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          category_id?: string | null;
          created_at?: string;
          id?: string;
          is_donated?: boolean;
          name: string;
          observation?: string | null;
          organizacion_id: string;
          sale_price?: number;
          stock_current?: number;
          unit_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          category_id?: string | null;
          created_at?: string;
          id?: string;
          is_donated?: boolean;
          name?: string;
          observation?: string | null;
          organizacion_id?: string;
          sale_price?: number;
          stock_current?: number;
          unit_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "buffet_products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "buffet_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "buffet_products_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "buffet_products_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "buffet_units";
            referencedColumns: ["id"];
          },
        ];
      };
      buffet_sale_items: {
        Row: {
          combo_id: string | null;
          created_at: string;
          description: string;
          id: string;
          line_total: number;
          organizacion_id: string;
          product_id: string | null;
          quantity: number;
          sale_id: string;
          unit_price: number;
        };
        ComputedFields: never;
        Insert: {
          combo_id?: string | null;
          created_at?: string;
          description: string;
          id?: string;
          line_total?: number;
          organizacion_id: string;
          product_id?: string | null;
          quantity?: number;
          sale_id: string;
          unit_price?: number;
        };
        Update: {
          combo_id?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          line_total?: number;
          organizacion_id?: string;
          product_id?: string | null;
          quantity?: number;
          sale_id?: string;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "buffet_sale_items_combo_id_fkey";
            columns: ["combo_id"];
            isOneToOne: false;
            referencedRelation: "buffet_combos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "buffet_sale_items_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "buffet_sale_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "buffet_products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "buffet_sale_items_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "buffet_sales";
            referencedColumns: ["id"];
          },
        ];
      };
      buffet_sales: {
        Row: {
          created_at: string;
          event_id: string;
          event_name: string | null;
          id: string;
          observation: string | null;
          organizacion_id: string;
          payment_method: string;
          sale_date: string;
          total_amount: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id: string;
          event_name?: string | null;
          id?: string;
          observation?: string | null;
          organizacion_id: string;
          payment_method?: string;
          sale_date?: string;
          total_amount?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          event_name?: string | null;
          id?: string;
          observation?: string | null;
          organizacion_id?: string;
          payment_method?: string;
          sale_date?: string;
          total_amount?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "buffet_sales_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "buffet_eventos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "buffet_sales_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      buffet_suppliers: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          organizacion_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          organizacion_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          organizacion_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "buffet_suppliers_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      buffet_units: {
        Row: {
          abbreviation: string | null;
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          pack_size: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          abbreviation?: string | null;
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          pack_size?: number;
          updated_at?: string;
        };
        Update: {
          abbreviation?: string | null;
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          pack_size?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      dispositivos_push: {
        Row: {
          auth: string;
          created_at: string;
          desactivado_at: string | null;
          email: string;
          endpoint: string;
          id: string;
          p256dh: string;
          ultimo_uso_at: string | null;
          user_agent: string | null;
        };
        ComputedFields: never;
        Insert: {
          auth: string;
          created_at?: string;
          desactivado_at?: string | null;
          email: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          ultimo_uso_at?: string | null;
          user_agent?: string | null;
        };
        Update: {
          auth?: string;
          created_at?: string;
          desactivado_at?: string | null;
          email?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          ultimo_uso_at?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "dispositivos_push_email_fkey";
            columns: ["email"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["email"];
          },
        ];
      };
      edades: {
        Row: {
          created_at: string;
          id: number;
          nombre: string;
          organizacion_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: number;
          nombre: string;
          organizacion_id: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          nombre?: string;
          organizacion_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "edades_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      grados_pibes: {
        Row: {
          created_at: string;
          grado: number;
          id: number;
          nivel: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          grado: number;
          id?: number;
          nivel: string;
        };
        Update: {
          created_at?: string;
          grado?: number;
          id?: number;
          nivel?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grados_pibes_nivel_fkey";
            columns: ["nivel"];
            isOneToOne: false;
            referencedRelation: "niveles_grados_pibes";
            referencedColumns: ["nivel"];
          },
        ];
      };
      niveles_grados_pibes: {
        Row: {
          created_at: string;
          id: number;
          nivel: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: number;
          nivel: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          nivel?: string;
        };
        Relationships: [];
      };
      notificaciones_push: {
        Row: {
          cancelada_at: string | null;
          created_at: string;
          destinatario_email: string;
          dispositivos_total: number;
          enviada_at: string | null;
          enviados: number;
          estado: string;
          fallidos: number;
          id: string;
          lote_id: string | null;
          motivo: string | null;
          organizacion_id: string;
          programada_para: string | null;
          remitente_email: string;
          texto: string;
          titulo: string;
          tomada_at: string | null;
          notificacion_push_json: Json | null;
        };
        ComputedFields: "notificacion_push_json";
        Insert: {
          cancelada_at?: string | null;
          created_at?: string;
          destinatario_email: string;
          dispositivos_total?: number;
          enviada_at?: string | null;
          enviados?: number;
          estado?: string;
          fallidos?: number;
          id?: string;
          lote_id?: string | null;
          motivo?: string | null;
          organizacion_id: string;
          programada_para?: string | null;
          remitente_email: string;
          texto: string;
          titulo: string;
          tomada_at?: string | null;
        };
        Update: {
          cancelada_at?: string | null;
          created_at?: string;
          destinatario_email?: string;
          dispositivos_total?: number;
          enviada_at?: string | null;
          enviados?: number;
          estado?: string;
          fallidos?: number;
          id?: string;
          lote_id?: string | null;
          motivo?: string | null;
          organizacion_id?: string;
          programada_para?: string | null;
          remitente_email?: string;
          texto?: string;
          titulo?: string;
          tomada_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notificaciones_push_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      organizacion_miembros: {
        Row: {
          created_at: string;
          created_by: string | null;
          email: string;
          organizacion_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          email: string;
          organizacion_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          email?: string;
          organizacion_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organizacion_miembros_email_fkey";
            columns: ["email"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["email"];
          },
          {
            foreignKeyName: "organizacion_miembros_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      organizaciones: {
        Row: {
          created_at: string;
          id: string;
          nombre: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          nombre?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          nombre?: string;
        };
        Relationships: [];
      };
      pibes: {
        Row: {
          apellido: string;
          created_at: string;
          edad_id: number;
          entrego_ficha: boolean;
          grado_id: number;
          id: string;
          nombre: string;
          observaciones: string | null;
          organizacion_id: string;
          telefono_emergencia: number | null;
        };
        ComputedFields: never;
        Insert: {
          apellido: string;
          created_at?: string;
          edad_id: number;
          entrego_ficha: boolean;
          grado_id: number;
          id?: string;
          nombre: string;
          observaciones?: string | null;
          organizacion_id: string;
          telefono_emergencia?: number | null;
        };
        Update: {
          apellido?: string;
          created_at?: string;
          edad_id?: number;
          entrego_ficha?: boolean;
          grado_id?: number;
          id?: string;
          nombre?: string;
          observaciones?: string | null;
          organizacion_id?: string;
          telefono_emergencia?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "pibes_edad_id_fkey";
            columns: ["edad_id"];
            isOneToOne: false;
            referencedRelation: "edades";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pibes_grado_id_fkey";
            columns: ["grado_id"];
            isOneToOne: false;
            referencedRelation: "grados_pibes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pibes_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          alcance: string;
          asignable_desde_panel: boolean;
          codigo: string;
          created_at: string;
          descripcion: string | null;
          nombre: string;
        };
        ComputedFields: never;
        Insert: {
          alcance: string;
          asignable_desde_panel?: boolean;
          codigo: string;
          created_at?: string;
          descripcion?: string | null;
          nombre: string;
        };
        Update: {
          alcance?: string;
          asignable_desde_panel?: boolean;
          codigo?: string;
          created_at?: string;
          descripcion?: string | null;
          nombre?: string;
        };
        Relationships: [];
      };
      solicitud_tipos: {
        Row: {
          codigo: string;
          created_at: string;
          descripcion: string | null;
          nombre: string;
        };
        ComputedFields: never;
        Insert: {
          codigo: string;
          created_at?: string;
          descripcion?: string | null;
          nombre: string;
        };
        Update: {
          codigo?: string;
          created_at?: string;
          descripcion?: string | null;
          nombre?: string;
        };
        Relationships: [];
      };
      solicitudes: {
        Row: {
          aprobador_id: string | null;
          comentario_aprobador: string | null;
          created_at: string;
          datos: NonNullable<Json>;
          estado: string;
          id: string;
          numero: number;
          organizacion_id: string | null;
          resuelta_at: string | null;
          solicitante_email: string;
          solicitante_nombre: string;
          tipo: string;
          tomada_at: string | null;
          updated_at: string;
          exigir_solicitud_pendiente: undefined | null;
          solicitud_aprobadores: string[] | null;
          solicitud_json: Json | null;
        };
        ComputedFields: "exigir_solicitud_pendiente" | "solicitud_aprobadores" | "solicitud_json";
        Insert: {
          aprobador_id?: string | null;
          comentario_aprobador?: string | null;
          created_at?: string;
          datos?: NonNullable<Json>;
          estado?: string;
          id?: string;
          numero?: never;
          organizacion_id?: string | null;
          resuelta_at?: string | null;
          solicitante_email: string;
          solicitante_nombre: string;
          tipo: string;
          tomada_at?: string | null;
          updated_at?: string;
        };
        Update: {
          aprobador_id?: string | null;
          comentario_aprobador?: string | null;
          created_at?: string;
          datos?: NonNullable<Json>;
          estado?: string;
          id?: string;
          numero?: never;
          organizacion_id?: string | null;
          resuelta_at?: string | null;
          solicitante_email?: string;
          solicitante_nombre?: string;
          tipo?: string;
          tomada_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "solicitudes_aprobador_id_fkey";
            columns: ["aprobador_id"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "solicitudes_organizacion_id_fkey";
            columns: ["organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizaciones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "solicitudes_tipo_fkey";
            columns: ["tipo"];
            isOneToOne: false;
            referencedRelation: "solicitud_tipos";
            referencedColumns: ["codigo"];
          },
        ];
      };
      usuario_roles: {
        Row: {
          alcance: string;
          created_at: string;
          created_by: string | null;
          email: string;
          id: string;
          organizacion_id: string | null;
          rol: string;
        };
        ComputedFields: never;
        Insert: {
          alcance: string;
          created_at?: string;
          created_by?: string | null;
          email: string;
          id?: string;
          organizacion_id?: string | null;
          rol: string;
        };
        Update: {
          alcance?: string;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          id?: string;
          organizacion_id?: string | null;
          rol?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usuario_roles_email_fkey";
            columns: ["email"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["email"];
          },
          {
            foreignKeyName: "usuario_roles_membresia_fkey";
            columns: ["email", "organizacion_id"];
            isOneToOne: false;
            referencedRelation: "organizacion_miembros";
            referencedColumns: ["email", "organizacion_id"];
          },
          {
            foreignKeyName: "usuario_roles_rol_fkey";
            columns: ["rol", "alcance"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["codigo", "alcance"];
          },
        ];
      };
      usuarios: {
        Row: {
          created_at: string;
          created_by: string | null;
          email: string;
          id: string;
          nombre: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          email: string;
          id?: string;
          nombre?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          email?: string;
          id?: string;
          nombre?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_alta_usuario: {
        Args: { p_actor: string; p_email: string; p_nombre: string; p_organizaciones: string[] };
        Returns: Json;
      };
      admin_cancelar_notificacion: { Args: { p_actor: string; p_id: string }; Returns: Json };
      admin_cerrar_notificacion: {
        Args: { p_actor: string; p_exitosos: string[]; p_id: string; p_invalidos: string[] };
        Returns: Json;
      };
      admin_crear_notificaciones: {
        Args: {
          p_actor: string;
          p_destinatarios: string[];
          p_organizacion_id: string;
          p_programada_para?: string;
          p_texto: string;
          p_titulo: string;
        };
        Returns: Json;
      };
      admin_editar_usuario: {
        Args: { p_actor: string; p_id: string; p_nombre: string; p_organizaciones: string[] };
        Returns: Json;
      };
      admin_listar_auditoria: { Args: { p_actor: string; p_limite?: number }; Returns: Json };
      admin_listar_dispositivos: { Args: { p_actor: string; p_organizacion_id?: string }; Returns: Json };
      admin_listar_notificaciones: {
        Args: { p_actor: string; p_limite?: number; p_organizacion_id?: string };
        Returns: Json;
      };
      admin_listar_organizaciones: { Args: { p_actor: string }; Returns: Json };
      admin_listar_solicitudes: { Args: { p_actor: string; p_estado?: string }; Returns: Json };
      admin_listar_usuarios: { Args: { p_actor: string }; Returns: Json };
      admin_preparar_notificacion: {
        Args: {
          p_actor: string;
          p_destinatario: string;
          p_organizacion_id: string;
          p_texto: string;
          p_titulo: string;
        };
        Returns: Json;
      };
      admin_quitar_acceso: { Args: { p_actor: string; p_id: string }; Returns: Json };
      admin_resolver_solicitud: {
        Args: {
          p_actor: string;
          p_comentario: string;
          p_decision: string;
          p_id: string;
          p_nombre_espacio?: string;
          p_organizacion_id?: string;
        };
        Returns: Json;
      };
      admin_tomar_solicitud: { Args: { p_actor: string; p_id: string }; Returns: Json };
      asistencia_fechas: {
        Args: { p_anio: number; p_org: string };
        Returns: {
          fecha: string;
          total: number;
        }[];
      };
      asistencia_top: {
        Args: { p_anio: number; p_org: string };
        Returns: {
          apellido: string;
          id: string;
          nombre: string;
          total: number;
        }[];
      };
      buffet_aplicar_stock: { Args: { p_items: Json; p_org: string; p_sign: number }; Returns: undefined };
      buffet_borrar_venta: { Args: { p_org: string; p_sale: string }; Returns: undefined };
      buffet_crear_venta: {
        Args: {
          p_event_id: string;
          p_items: Json;
          p_observation: string;
          p_org: string;
          p_payment_method: string;
          p_sale_date: string;
          p_total: number;
        };
        Returns: Json;
      };
      buffet_editar_venta: {
        Args: {
          p_items: Json;
          p_observation: string;
          p_org: string;
          p_payment_method: string;
          p_sale: string;
          p_total: number;
        };
        Returns: Json;
      };
      buffet_insertar_items_venta: {
        Args: { p_items: Json; p_org: string; p_sale: string };
        Returns: undefined;
      };
      buffet_items_de_venta: { Args: { p_org: string; p_sale: string }; Returns: Json };
      buscar_pibes: {
        Args: { termino: string };
        Returns: {
          apellido: string;
          created_at: string;
          edad_id: number;
          entrego_ficha: boolean;
          grado_id: number;
          id: string;
          nombre: string;
          observaciones: string | null;
          organizacion_id: string;
          telefono_emergencia: number | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "pibes";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      buscar_pibes_resumen: {
        Args: { p_fecha?: string; p_limite?: number; p_org: string; p_termino: string };
        Returns: {
          apellido: string;
          edad_id: number;
          edad_nombre: string;
          entrego_ficha: boolean;
          grado_id: number;
          grado_nivel: string;
          grado_numero: number;
          id: string;
          marcado_hoy: boolean;
          nombre: string;
          observaciones: string;
          telefono_emergencia: number;
          ultima_asistencia: string;
          visitas: number;
        }[];
      };
      contexto_usuario: { Args: { p_email: string }; Returns: Json };
      despachar_notificaciones_programadas: { Args: Record<PropertyKey, never>; Returns: undefined };
      email_normalizado: { Args: { p_email: string }; Returns: string };
      es_superadmin: { Args: { p_email: string }; Returns: boolean };
      exigir_admin: { Args: { p_actor: string }; Returns: string[] };
      exigir_solicitud_pendiente: {
        Args: {
          s: Omit<
            Database["public"]["Tables"]["solicitudes"]["Row"],
            Database["public"]["Tables"]["solicitudes"]["ComputedFields"]
          >;
        };
        Returns: undefined;
      };
      exigir_superadmin: { Args: { p_actor: string }; Returns: undefined };
      id_de_usuario: { Args: { p_email: string }; Returns: string };
      limpiar_usuario_sin_acceso: { Args: { p_actor: string; p_email: string }; Returns: boolean };
      lista_organizaciones: { Args: { p_organizaciones: string[] }; Returns: string[] };
      normalizar_busqueda: { Args: { texto: string }; Returns: string };
      notificacion_push_json: {
        Args: {
          n: Omit<
            Database["public"]["Tables"]["notificaciones_push"]["Row"],
            Database["public"]["Tables"]["notificaciones_push"]["ComputedFields"]
          >;
        };
        Returns: Json;
      };
      organizaciones_administradas: { Args: { p_email: string }; Returns: string[] };
      organizaciones_del_usuario: { Args: Record<PropertyKey, never>; Returns: string[] };
      push_cerrar_programada: {
        Args: { p_exitosos: string[]; p_id: string; p_invalidos: string[] };
        Returns: Json;
      };
      push_quitar_dispositivo: { Args: { p_email: string; p_endpoint: string }; Returns: Json };
      push_registrar_dispositivo: {
        Args: { p_auth: string; p_email: string; p_endpoint: string; p_p256dh: string; p_user_agent: string };
        Returns: Json;
      };
      push_tomar_vencidas: { Args: { p_limite?: number }; Returns: Json };
      registrar_auditoria: {
        Args: { p_accion: string; p_actor: string; p_detalle?: Json; p_objetivo: string; p_org: string };
        Returns: undefined;
      };
      registro_cancelar_solicitud: { Args: { p_email: string; p_id: string }; Returns: Json };
      registro_crear_solicitud: {
        Args: { p_email: string; p_nombre: string; p_nombre_espacio: string; p_organizacion_id: string };
        Returns: Json;
      };
      registro_estado: { Args: { p_email: string }; Returns: Json };
      solicitud_aprobadores: {
        Args: {
          s: Omit<
            Database["public"]["Tables"]["solicitudes"]["Row"],
            Database["public"]["Tables"]["solicitudes"]["ComputedFields"]
          >;
        };
        Returns: string[];
      };
      solicitud_json: {
        Args: {
          s: Omit<
            Database["public"]["Tables"]["solicitudes"]["Row"],
            Database["public"]["Tables"]["solicitudes"]["ComputedFields"]
          >;
        };
        Returns: Json;
      };
      solicitud_para_actor: {
        Args: { p_actor: string; p_id: string };
        Returns: {
          aprobador_id: string | null;
          comentario_aprobador: string | null;
          created_at: string;
          datos: NonNullable<Json>;
          estado: string;
          id: string;
          numero: number;
          organizacion_id: string | null;
          resuelta_at: string | null;
          solicitante_email: string;
          solicitante_nombre: string;
          tipo: string;
          tomada_at: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "solicitudes";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      solicitud_visible_para: {
        Args: {
          p_actor: string;
          s: Omit<
            Database["public"]["Tables"]["solicitudes"]["Row"],
            Database["public"]["Tables"]["solicitudes"]["ComputedFields"]
          >;
        };
        Returns: boolean;
      };
      superadmin_asignar_rol: {
        Args: {
          p_actor: string;
          p_email: string;
          p_nombre: string;
          p_organizaciones: string[];
          p_rol: string;
        };
        Returns: Json;
      };
      superadmin_guardar_organizacion: {
        Args: { p_actor: string; p_id: string; p_nombre: string };
        Returns: Json;
      };
      superadmin_quitar_rol: { Args: { p_actor: string; p_id: string; p_rol: string }; Returns: Json };
      tiene_acceso: { Args: { p_email: string }; Returns: boolean };
      usuario_protegido_para: { Args: { p_actor: string; p_objetivo: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
