import { useState, useEffect, useRef, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Calculator, User, Calendar, FileText, Package2 as Package, X, Wrench, Box, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertQuotationSchema, type Quotation, type Customer, type Product } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface QuotationItem {
  productId?: number;
  productName: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountType: "percent" | "amount";
  discount: number;
  total: number;
}

interface QuotationFormData {
  quotationNumber: string;
  customerId: number;
  projectName: string;
  date: string;
  validUntil: string;
  priceIncludesVat: boolean;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  grandTotal: number;
  status: string;
  notes?: string;
  items: QuotationItem[];
}

const quotationFormSchema = insertQuotationSchema.extend({
  projectName: z.string().optional(),
  priceIncludesVat: z.boolean(),
  items: z.array(z.object({
    productId: z.number().optional(),
    productName: z.string().min(1, "ต้องระบุชื่อสินค้า"),
    description: z.string().optional(),
    quantity: z.number().min(1),
    unit: z.string().min(1),
    unitPrice: z.number().min(0),
    discountType: z.enum(["percent", "amount"]),
    discount: z.number().min(0),
    total: z.number().min(0)
  })).min(1, "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ")
});

export default function Sales() {
  const { t } = useLanguage();
  const { tenant } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
  const [productSearchTerms, setProductSearchTerms] = useState<{[key: number]: string}>({});
  const [showProductDropdowns, setShowProductDropdowns] = useState<{[key: number]: boolean}>({});
  const productDropdownRefs = useRef<{[key: number]: HTMLDivElement | null}>({});

  // Generate quotation number in format QT+YYYY+MM+sequence  
  const generateQuotationNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    // Find the highest sequence number for current year/month
    const currentQuotations = quotations || [];
    const currentPrefix = `QT${year}${month}`;
    
    let maxSequence = 0;
    if (Array.isArray(currentQuotations)) {
      currentQuotations.forEach((q: any) => {
        if (q.quotationNumber && q.quotationNumber.startsWith(currentPrefix)) {
          const sequenceStr = q.quotationNumber.substring(currentPrefix.length);
          const sequence = parseInt(sequenceStr);
          if (!isNaN(sequence) && sequence > maxSequence) {
            maxSequence = sequence;
          }
        }
      });
    }
    
    const nextSequence = String(maxSequence + 1).padStart(3, '0');
    return `${currentPrefix}${nextSequence}`;
  };

  const getDefaultDates = () => {
    const today = new Date();
    const validUntil = new Date();
    validUntil.setDate(today.getDate() + 30);
    
    return {
      date: today.toISOString().split('T')[0],
      validUntil: validUntil.toISOString().split('T')[0]
    };
  };

  const form = useForm<QuotationFormData>({
    resolver: zodResolver(quotationFormSchema),
    defaultValues: {
      quotationNumber: generateQuotationNumber(),
      customerId: 0,
      projectName: "",
      ...getDefaultDates(),
      priceIncludesVat: false,
      subtotal: 0,
      discountPercent: 0,
      discountAmount: 0,
      taxPercent: 7,
      taxAmount: 0,
      grandTotal: 0,
      status: "draft",
      notes: "",
      items: [{
        productName: "",
        description: "",
        quantity: 1,
        unit: "ชิ้น",
        unitPrice: 0,
        discountType: "percent" as const,
        discount: 0,
        total: 0
      }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items"
  });

  // Data queries
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: !!tenant
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/inventory"],
    enabled: !!tenant
  });

  const { data: quotations = [] } = useQuery<Quotation[]>({
    queryKey: ["/api/quotations"],
    enabled: !!tenant
  });

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      
      Object.keys(showProductDropdowns).forEach(key => {
        const index = parseInt(key);
        const ref = productDropdownRefs.current[index];
        if (ref && !ref.contains(target)) {
          setShowProductDropdowns(prev => ({ ...prev, [index]: false }));
        }
      });
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProductDropdowns]);

  // Helper functions
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "service": return <Wrench className="h-4 w-4" />;
      case "non_stock_product": return <Box className="h-4 w-4" />;
      case "stock_product": return <Archive className="h-4 w-4" />;
      default: return <Package className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "service": return "บริการ";
      case "non_stock_product": return "สินค้าไม่นับสต็อก";
      case "stock_product": return "สินค้านับสต็อก";
      default: return type;
    }
  };

  // Filter products based on search term
  const getFilteredProducts = (searchTerm: string) => {
    if (!searchTerm) return products.slice(0, 10); // Show first 10 products if no search term
    return products.filter(product => 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.description && product.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  };

  // Handle product selection
  const handleProductSelect = (index: number, product: Product) => {
    form.setValue(`items.${index}.productId`, product.id);
    form.setValue(`items.${index}.productName`, product.name);
    form.setValue(`items.${index}.description`, product.description || "");
    form.setValue(`items.${index}.unit`, product.unit);
    form.setValue(`items.${index}.unitPrice`, parseFloat(product.price?.toString() || "0"));
    
    setProductSearchTerms(prev => ({ ...prev, [index]: product.name }));
    setShowProductDropdowns(prev => ({ ...prev, [index]: false }));
    
    calculateTotals();
  };

  // Calculate totals
  const calculateTotals = () => {
    const items = form.getValues("items");
    const taxPercent = form.getValues("taxPercent") / 100;
    const priceIncludesVat = form.getValues("priceIncludesVat");
    
    let subtotal = 0;
    
    // Calculate individual item totals
    items.forEach((item, index) => {
      let basePrice = item.unitPrice;
      
      // If price includes VAT, calculate the price without VAT
      if (priceIncludesVat) {
        basePrice = item.unitPrice / (1 + taxPercent);
      }
      
      // Calculate discount
      let discountAmount = 0;
      if (item.discountType === "percent") {
        discountAmount = basePrice * (item.discount / 100);
      } else {
        discountAmount = item.discount;
      }
      
      const priceAfterDiscount = basePrice - discountAmount;
      const itemTotal = item.quantity * priceAfterDiscount;
      
      form.setValue(`items.${index}.total`, itemTotal);
      subtotal += itemTotal;
    });
    
    const discountAmount = subtotal * (form.getValues("discountPercent") / 100);
    const subtotalAfterDiscount = subtotal - discountAmount;
    const taxAmount = subtotalAfterDiscount * taxPercent;
    const grandTotal = subtotalAfterDiscount + taxAmount;

    form.setValue("subtotal", subtotal);
    form.setValue("discountAmount", discountAmount);
    form.setValue("taxAmount", taxAmount);
    form.setValue("grandTotal", grandTotal);
  };

  // Mutations
  const quotationMutation = useMutation({
    mutationFn: async (data: QuotationFormData) => {
      const url = editingQuotation ? `/api/quotations/${editingQuotation.id}` : "/api/quotations";
      const method = editingQuotation ? "PATCH" : "POST";
      
      return apiRequest(url, method, { ...data, tenantId: tenant?.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      setIsDialogOpen(false);
      form.reset();
      setEditingQuotation(null);
      toast({
        title: editingQuotation ? "แก้ไขใบเสนอราคาสำเร็จ" : "สร้างใบเสนอราคาสำเร็จ",
        description: editingQuotation ? "บันทึกการแก้ไขเรียบร้อยแล้ว" : "ใบเสนอราคาใหม่ถูกสร้างแล้ว"
      });
    },
    onError: (error: any) => {
      toast({
        title: "เกิดข้อผิดพลาด",
        description: error.message || "ไม่สามารถบันทึกใบเสนอราคาได้",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (data: QuotationFormData) => {
    calculateTotals();
    quotationMutation.mutate(data);
  };

  const addItem = () => {
    append({
      productName: "",
      description: "",
      quantity: 1,
      unit: "ชิ้น",
      unitPrice: 0,
      discountType: "percent" as const,
      discount: 0,
      total: 0
    });
  };

  const resetForm = () => {
    setEditingQuotation(null);
    setProductSearchTerms({});
    setShowProductDropdowns({});
    form.reset({
      quotationNumber: generateQuotationNumber(),
      customerId: 0,
      ...getDefaultDates(),
      subtotal: 0,
      discountPercent: 0,
      discountAmount: 0,
      taxPercent: 7,
      taxAmount: 0,
      grandTotal: 0,
      status: "draft",
      notes: "",
      items: [{
        productName: "",
        description: "",
        quantity: 1,
        unit: "ชิ้น",
        unitPrice: 0,
        discountType: "percent" as const,
        discount: 0,
        total: 0
      }]
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">การขาย</h1>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            สร้างใบเสนอราคาใหม่
          </Button>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingQuotation ? "แก้ไขใบเสนอราคา" : "สร้างใบเสนอราคาใหม่"}
              </DialogTitle>
              <DialogDescription>
                กรุณากรอกข้อมูลใบเสนอราคา
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                {/* Header Information */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="quotationNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>เลขที่ใบเสนอราคา</FormLabel>
                        <FormControl>
                          <Input {...field} readOnly className="bg-gray-50" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ลูกค้า *</FormLabel>
                        <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="เลือกลูกค้า" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {customers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id.toString()}>
                                {customer.name}
                                {customer.companyName && ` (${customer.companyName})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>สถานะ</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="draft">ร่าง</SelectItem>
                            <SelectItem value="sent">ส่งแล้ว</SelectItem>
                            <SelectItem value="approved">อนุมัติ</SelectItem>
                            <SelectItem value="rejected">ปฏิเสธ</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="projectName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ชื่อโปรเจค</FormLabel>
                        <FormControl>
                          <Input placeholder="ระบุชื่อโปรเจค" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>วันที่ *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="validUntil"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>วันหมดอายุ *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priceIncludesVat"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm">ราคารวม VAT</FormLabel>
                        </div>
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={(e) => {
                              field.onChange(e.target.checked);
                              calculateTotals();
                            }}
                            className="h-4 w-4"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Items Section */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">รายการสินค้า/บริการ</h3>
                    <Button type="button" onClick={addItem} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      เพิ่มรายการ
                    </Button>
                  </div>

                  {/* Table Format */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-300 p-3 text-left min-w-[200px]">สินค้า/บริการ</th>
                          <th className="border border-gray-300 p-3 text-left min-w-[150px]">รายละเอียด</th>
                          <th className="border border-gray-300 p-3 text-center w-20">จำนวน</th>
                          <th className="border border-gray-300 p-3 text-center w-16">หน่วย</th>
                          <th className="border border-gray-300 p-3 text-center w-24">ราคา/หน่วย</th>
                          <th className="border border-gray-300 p-3 text-center w-20">ประเภทส่วนลด</th>
                          <th className="border border-gray-300 p-3 text-center w-20">ส่วนลด</th>
                          <th className="border border-gray-300 p-3 text-center w-24">รวม</th>
                          <th className="border border-gray-300 p-3 text-center w-16">ลบ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((field, index) => (
                          <tr key={field.id} className="hover:bg-gray-50">
                            {/* Product Selection */}
                            <td className="border border-gray-300 p-2">
                              <div className="relative" ref={el => productDropdownRefs.current[index] = el}>
                                <Input
                                  placeholder="ค้นหาสินค้า..."
                                  value={productSearchTerms[index] || form.watch(`items.${index}.productName`)}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setProductSearchTerms(prev => ({ ...prev, [index]: value }));
                                    form.setValue(`items.${index}.productName`, value);
                                    setShowProductDropdowns(prev => ({ ...prev, [index]: true }));
                                  }}
                                  onFocus={() => setShowProductDropdowns(prev => ({ ...prev, [index]: true }))}
                                  className="w-full"
                                />
                                
                                {showProductDropdowns[index] && (
                                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                    {getFilteredProducts(productSearchTerms[index] || "").map((product) => (
                                      <div
                                        key={product.id}
                                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                                        onClick={() => handleProductSelect(index, product)}
                                      >
                                        <div className="flex items-center space-x-2">
                                          {getTypeIcon(product.type)}
                                          <div>
                                            <div className="font-medium text-sm">{product.name}</div>
                                            <div className="text-xs text-gray-500">
                                              {product.sku} • {getTypeLabel(product.type)} • {product.unit}
                                              {product.price && ` • ฿${parseFloat(product.price.toString()).toFixed(2)}`}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                    {getFilteredProducts(productSearchTerms[index] || "").length === 0 && (
                                      <div className="px-3 py-2 text-gray-500 text-sm">ไม่พบสินค้า</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Description */}
                            <td className="border border-gray-300 p-2">
                              <FormField
                                control={form.control}
                                name={`items.${index}.description`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Textarea 
                                        placeholder="รายละเอียด"
                                        className="min-h-[40px] text-sm"
                                        {...field}
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </td>

                            {/* Quantity */}
                            <td className="border border-gray-300 p-2">
                              <FormField
                                control={form.control}
                                name={`items.${index}.quantity`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="1"
                                        className="w-full text-center"
                                        {...field}
                                        onChange={(e) => {
                                          field.onChange(parseInt(e.target.value) || 1);
                                          calculateTotals();
                                        }}
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </td>

                            {/* Unit */}
                            <td className="border border-gray-300 p-2">
                              <FormField
                                control={form.control}
                                name={`items.${index}.unit`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input {...field} className="w-full text-center" />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </td>

                            {/* Unit Price */}
                            <td className="border border-gray-300 p-2">
                              <FormField
                                control={form.control}
                                name={`items.${index}.unitPrice`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="w-full text-right"
                                        {...field}
                                        onChange={(e) => {
                                          field.onChange(parseFloat(e.target.value) || 0);
                                          calculateTotals();
                                        }}
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </td>

                            {/* Discount Type */}
                            <td className="border border-gray-300 p-2">
                              <FormField
                                control={form.control}
                                name={`items.${index}.discountType`}
                                render={({ field }) => (
                                  <FormItem>
                                    <Select onValueChange={(value) => {
                                      field.onChange(value);
                                      form.setValue(`items.${index}.discount`, 0);
                                      calculateTotals();
                                    }} value={field.value}>
                                      <FormControl>
                                        <SelectTrigger className="w-full">
                                          <SelectValue />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="percent">%</SelectItem>
                                        <SelectItem value="amount">฿</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </FormItem>
                                )}
                              />
                            </td>

                            {/* Discount */}
                            <td className="border border-gray-300 p-2">
                              <FormField
                                control={form.control}
                                name={`items.${index}.discount`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max={form.watch(`items.${index}.discountType`) === "percent" ? "100" : undefined}
                                        className="w-full text-right"
                                        {...field}
                                        onChange={(e) => {
                                          field.onChange(parseFloat(e.target.value) || 0);
                                          calculateTotals();
                                        }}
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </td>

                            {/* Total */}
                            <td className="border border-gray-300 p-2 text-right font-medium">
                              ฿{(form.watch(`items.${index}.total`) || 0).toFixed(2)}
                            </td>

                            {/* Delete */}
                            <td className="border border-gray-300 p-2 text-center">
                              {fields.length > 1 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    remove(index);
                                    calculateTotals();
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Summary */}
                <div className="border-t pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>หมายเหตุ</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="หมายเหตุเพิ่มเติม"
                                className="min-h-[100px]"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span>ยอดรวม:</span>
                        <span>฿{form.watch("subtotal")?.toFixed(2) || "0.00"}</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span>ส่วนลดเพิ่มเติม (%):</span>
                        <div className="w-32">
                          <FormField
                            control={form.control}
                            name="discountPercent"
                            render={({ field }) => (
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                className="text-right"
                                {...field}
                                onChange={(e) => {
                                  field.onChange(parseFloat(e.target.value) || 0);
                                  calculateTotals();
                                }}
                              />
                            )}
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-between">
                        <span>ส่วนลด:</span>
                        <span>฿{form.watch("discountAmount")?.toFixed(2) || "0.00"}</span>
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <span>VAT (%):</span>
                        <div className="w-32">
                          <FormField
                            control={form.control}
                            name="taxPercent"
                            render={({ field }) => (
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                className="text-right"
                                {...field}
                                onChange={(e) => {
                                  field.onChange(parseFloat(e.target.value) || 0);
                                  calculateTotals();
                                }}
                              />
                            )}
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-between">
                        <span>VAT:</span>
                        <span>฿{form.watch("taxAmount")?.toFixed(2) || "0.00"}</span>
                      </div>
                      
                      <div className="flex justify-between font-bold text-lg border-t pt-2">
                        <span>ยอดรวมสุทธิ:</span>
                        <span>฿{form.watch("grandTotal")?.toFixed(2) || "0.00"}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    ยกเลิก
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={quotationMutation.isPending}
                  >
                    {quotationMutation.isPending ? "กำลังบันทึก..." : 
                     editingQuotation ? "อัพเดท" : "บันทึก"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quotations List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>ใบเสนอราคา</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {quotations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              ไม่มีใบเสนอราคา
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">เลขที่</th>
                    <th className="text-left p-3">ลูกค้า</th>
                    <th className="text-left p-3">วันที่</th>
                    <th className="text-left p-3">ยอดรวม</th>
                    <th className="text-left p-3">สถานะ</th>
                    <th className="text-left p-3">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {quotations.map((quotation) => (
                    <tr key={quotation.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">{quotation.quotationNumber}</td>
                      <td className="p-3">
                        {customers.find(c => c.id === quotation.customerId)?.name || '-'}
                      </td>
                      <td className="p-3">{new Date(quotation.date).toLocaleDateString('th-TH')}</td>
                      <td className="p-3">฿{(typeof quotation.grandTotal === 'string' ? parseFloat(quotation.grandTotal) : quotation.grandTotal).toFixed(2)}</td>
                      <td className="p-3">
                        <Badge variant={quotation.status === 'approved' ? 'default' : 'secondary'}>
                          {quotation.status === 'draft' && 'ร่าง'}
                          {quotation.status === 'sent' && 'ส่งแล้ว'}
                          {quotation.status === 'approved' && 'อนุมัติ'}
                          {quotation.status === 'rejected' && 'ปฏิเสธ'}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex space-x-2">
                          <Button size="sm" variant="outline">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}