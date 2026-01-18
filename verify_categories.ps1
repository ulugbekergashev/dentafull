$ErrorActionPreference = "Stop"

try {
    Write-Host "Logging in..."
    $loginBody = @{
        username = "demoklinikaadmin"
        password = "demoklinikaparol"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    
    Write-Host "Login Response:"
    Write-Host ($response | ConvertTo-Json -Depth 5)

    $token = $response.token
    $clinicId = $response.clinicId

    if (-not $clinicId) {
        Write-Error "ClinicId is missing in login response"
    }

    Write-Host "Logged in successfully. ClinicId: $clinicId"

    # 1. Get Categories (should be empty or have existing)
    Write-Host "Fetching categories..."
    $categories = Invoke-RestMethod -Uri "http://localhost:3001/api/categories?clinicId=$clinicId" -Method Get -Headers @{Authorization="Bearer $token"}
    Write-Host "Categories count: $($categories.Count)"

    # 2. Create Category
    Write-Host "Creating 'Test Category'..."
    $catBody = @{
        name = "Test Category"
        clinicId = $clinicId
    } | ConvertTo-Json
    $newCategory = Invoke-RestMethod -Uri "http://localhost:3001/api/categories" -Method Post -Headers @{Authorization="Bearer $token"} -Body $catBody -ContentType "application/json"
    Write-Host "Created Category ID: $($newCategory.id)"

    # 3. Create Service with Category
    Write-Host "Creating 'Test Service'..."
    $svcBody = @{
        name = "Test Service"
        price = 100000
        duration = 30
        clinicId = $clinicId
        categoryId = $newCategory.id
    } | ConvertTo-Json
    $newService = Invoke-RestMethod -Uri "http://localhost:3001/api/services" -Method Post -Headers @{Authorization="Bearer $token"} -Body $svcBody -ContentType "application/json"
    Write-Host "Created Service ID: $($newService.id)"

    # 4. Get Services and check category
    Write-Host "Fetching services to verify category..."
    $services = Invoke-RestMethod -Uri "http://localhost:3001/api/services?clinicId=$clinicId" -Method Get -Headers @{Authorization="Bearer $token"}
    $createdService = $services | Where-Object { $_.id -eq $newService.id }
    
    if ($createdService.categoryId -eq $newCategory.id) {
        Write-Host "SUCCESS: Service has correct categoryId"
    } else {
        Write-Error "FAILURE: Service categoryId mismatch. Expected $($newCategory.id), got $($createdService.categoryId)"
    }

    if ($createdService.category.id -eq $newCategory.id) {
        Write-Host "SUCCESS: Service has correct category object"
    } else {
        Write-Error "FAILURE: Service category object mismatch or missing"
    }

    # Cleanup
    Write-Host "Cleaning up..."
    Invoke-RestMethod -Uri "http://localhost:3001/api/services/$($newService.id)" -Method Delete -Headers @{Authorization="Bearer $token"}
    Invoke-RestMethod -Uri "http://localhost:3001/api/categories/$($newCategory.id)" -Method Delete -Headers @{Authorization="Bearer $token"}
    Write-Host "Cleanup complete."

} catch {
    Write-Error "An error occurred: $_"
    exit 1
}
