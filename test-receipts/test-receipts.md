# 🧾 Test Receipts for Expense System

## 📁 Available Test Receipts

### 1. **Restaurant Receipt** (`restaurant-receipt.txt`)
- **Vendor**: Restaurante Brasileiro
- **Amount**: R$ 50.38
- **Category**: meals
- **Description**: Business lunch with client
- **Items**: Prato Feito, Refrigerante, Sobremesa

### 2. **Transportation Receipt** (`uber-receipt.txt`)
- **Vendor**: Uber
- **Amount**: R$ 32.50
- **Category**: transportation
- **Description**: Client meeting transportation
- **Details**: 8.5 km, 18 minutes

### 3. **Office Supplies Receipt** (`office-supplies-receipt.txt`)
- **Vendor**: Papelaria Central
- **Amount**: R$ 127.90
- **Category**: office_supplies
- **Description**: Office supplies for team
- **Items**: Notebooks, Pens, Stapler, Paper clips

## 🚀 How to Test Receipt Functionality

### **Step 1: Login to the System**
1. Open http://localhost:3001
2. Login with any test user:
   - Admin: `admin@reembolso.com` / `admin123`
   - Employee: `employee1@reembolso.com` / `employee123`

### **Step 2: Create New Expense with Receipt**
1. Go to "Create Expense" page
2. Fill in expense details:
   - **Title**: "Business Lunch - Client Meeting"
   - **Description**: "Lunch with potential client to discuss project"
   - **Amount**: 50.38
   - **Currency**: BRL
   - **Expense Date**: 2025-01-15
   - **Vendor**: Restaurante Brasileiro
   - **Category**: meals

3. **Upload Receipt**: Use one of the text files above
4. Click "Create Expense"

### **Step 3: Test OCR Processing**
- The system will automatically:
  - Upload receipt to S3
  - Process OCR to extract text
  - Use ML to categorize the expense
  - Store in database

### **Step 4: Verify Results**
1. Check the expense was created
2. Verify OCR data was extracted
3. Confirm ML categorization is correct
4. Check receipt is stored and accessible

## 🔧 Testing Different Scenarios

### **Scenario 1: Restaurant Expense**
- Use `restaurant-receipt.txt`
- Test meal categorization
- Verify amount extraction

### **Scenario 2: Transportation Expense**
- Use `uber-receipt.txt`
- Test transportation categorization
- Verify distance/time extraction

### **Scenario 3: Office Supplies**
- Use `office-supplies-receipt.txt`
- Test office supplies categorization
- Verify item list extraction

## 📊 Expected Results

### **OCR Processing:**
- Text extraction from receipts
- Vendor name recognition
- Amount extraction
- Date recognition

### **ML Categorization:**
- Automatic category assignment
- Confidence scores
- Vendor classification

### **Data Storage:**
- Receipt files in S3
- OCR data in database
- Audit trail logging
- Expense status tracking

## 🐛 Troubleshooting

### **If OCR fails:**
- Check ML service is running (port 5001)
- Verify receipt file format
- Check backend logs

### **If upload fails:**
- Verify file size < 10MB
- Check file format (JPEG, PNG, PDF)
- Ensure user is authenticated

### **If categorization fails:**
- Check ML service health
- Verify expense data is complete
- Check backend logs for errors

## 📈 Next Steps

1. **Test with real receipt images** (JPEG/PNG)
2. **Test PDF receipts**
3. **Test bulk uploads**
4. **Test approval workflow**
5. **Test reporting features**

---

**Note**: These are text-based receipts for testing. For full OCR testing, you'll need actual receipt images (JPEG, PNG) or PDF files.
